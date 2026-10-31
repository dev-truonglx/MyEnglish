// FSRS parameter optimizer, shared by the desktop app (src-tauri/src/lib.rs) and the web version
// (web/fsrs-wasm, compiled to WebAssembly): both `include!` this file, so they run the same code on the
// same fsrs crate version.

/// One review in a card's history.
#[derive(serde::Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct FsrsReviewInput {
    /// 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
    rating: u32,
    /// Whole days since the previous review (0 for the first review and same-day reviews)
    #[serde(alias = "delta_t")]
    delta_t: u32,
}

/// One card's full review history, oldest first.
///
/// JSON from JS: `invoke("compute_fsrs_parameters", { items: [
///   { reviews: [ { rating: 3, deltaT: 0 }, { rating: 3, deltaT: 2 }, { rating: 1, deltaT: 7 } ] }, ...] })`
/// (`delta_t` is accepted as an alias of `deltaT`). Send whole histories, NOT prefixes: like Anki,
/// the command itself turns each history into one training item per later long-term review.
#[derive(serde::Deserialize, Debug, Clone)]
struct FsrsItemInput {
    reviews: Vec<FsrsReviewInput>,
}

#[derive(serde::Serialize, Debug, Clone, Copy)]
struct FsrsMetrics {
    log_loss: f32,
    /// RMSE (bins), the metric Anki shows
    rmse: f32,
}

#[derive(serde::Serialize, Debug, Clone)]
struct FsrsOptimizeResult {
    /// 21 FSRS-6 parameters (same layout as ts-fsrs 5.x `w`)
    parameters: Vec<f32>,
    /// Default parameters evaluated on the same data
    default_metrics: FsrsMetrics,
    /// Optimized parameters evaluated on the same data
    new_metrics: FsrsMetrics,
    /// Reviews in the accepted histories
    review_count: usize,
    /// Cards (input items) with at least 2 reviews
    item_count: usize,
    /// Training items built from the histories (one per long-term review after the first)
    train_item_count: usize,
}

/// Upper bound on reviews per call, to keep memory and run time bounded.
const FSRS_MAX_REVIEWS: usize = 1_000_000;

/// fsrs training data built from card histories.
struct FsrsTrainingSet {
    items: Vec<fsrs::FSRSItem>,
    /// Card index of each item (prefix chains of one card share an id, which lets fsrs compute
    /// each card's memory trajectory once)
    card_ids: Vec<i64>,
    cards: usize,
    reviews: usize,
}

/// Turn card histories into fsrs training items.
fn build_fsrs_training_items(items: &[FsrsItemInput]) -> Result<FsrsTrainingSet, String> {
    let total_reviews: usize = items.iter().map(|i| i.reviews.len()).sum();
    if total_reviews > FSRS_MAX_REVIEWS {
        return Err(format!("Quá nhiều lượt ôn ({}), tối đa {}.", total_reviews, FSRS_MAX_REVIEWS));
    }
    if items.iter().flat_map(|i| &i.reviews).any(|r| !(1..=4).contains(&r.rating)) {
        return Err("Đánh giá (rating) phải từ 1 đến 4.".to_string());
    }

    let mut train = Vec::new();
    let mut card_ids = Vec::new();
    let mut cards = 0;
    let mut reviews_used = 0;
    for item in items.iter().filter(|i| i.reviews.len() >= 2) {
        cards += 1;
        reviews_used += item.reviews.len();
        let history: Vec<fsrs::FSRSReview> = item
            .reviews
            .iter()
            .enumerate()
            .map(|(idx, r)| fsrs::FSRSReview {
                rating: r.rating,
                // fsrs requires delta_t = 0 for the first review
                delta_t: if idx == 0 { 0 } else { r.delta_t },
            })
            .collect();
        // Like Anki: predict every later long-term review (delta_t > 0) from the history before it
        for idx in 1..history.len() {
            if history[idx].delta_t > 0 {
                train.push(fsrs::FSRSItem { reviews: history[..=idx].to_vec() });
                card_ids.push(cards as i64);
            }
        }
    }
    if cards < 2 {
        return Err("Cần ít nhất 2 thẻ có từ 2 lượt ôn trở lên để tối ưu tham số.".to_string());
    }
    if train.is_empty() {
        return Err("Chưa có lượt ôn nào cách ngày (delta_t > 0) để tối ưu tham số.".to_string());
    }
    Ok(FsrsTrainingSet { items: train, card_ids, cards, reviews: reviews_used })
}

fn fsrs_metrics(model: &fsrs::FSRS, set: &FsrsTrainingSet) -> Result<FsrsMetrics, String> {
    let eval = model
        .evaluate_with_card_ids(set.items.clone(), set.card_ids.clone(), |_| true)
        .map_err(|e| format!("FSRS evaluate failed: {:?}", e))?;
    Ok(FsrsMetrics { log_loss: eval.log_loss, rmse: eval.rmse_bins })
}

fn optimize_fsrs_parameters(items: &[FsrsItemInput]) -> Result<FsrsOptimizeResult, String> {
    let set = build_fsrs_training_items(items)?;
    let parameters = fsrs::compute_parameters(fsrs::ComputeParametersInput {
        train_set: set.items.clone(),
        card_ids: Some(set.card_ids.clone()),
        ..Default::default()
    })
    .map_err(|e| format!("FSRS optimization failed: {:?}", e))?;
    if parameters.len() != fsrs::DEFAULT_PARAMETERS.len() || parameters.iter().any(|p| !p.is_finite()) {
        return Err("FSRS optimization returned invalid parameters".to_string());
    }

    let default_model = fsrs::FSRS::default();
    let new_model = fsrs::FSRS::new(&parameters).map_err(|e| format!("Invalid FSRS parameters: {:?}", e))?;
    Ok(FsrsOptimizeResult {
        default_metrics: fsrs_metrics(&default_model, &set)?,
        new_metrics: fsrs_metrics(&new_model, &set)?,
        parameters,
        review_count: set.reviews,
        item_count: set.cards,
        train_item_count: set.items.len(),
    })
}
