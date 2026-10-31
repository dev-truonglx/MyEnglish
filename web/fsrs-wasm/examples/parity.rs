//! Parity check helper (scripts/web/fsrs-parity.mjs): `parity gen <cards>` prints review histories made by
//! the same generator as the desktop test; `parity opt` reads histories on stdin and prints the native result.
use std::io::Read;

fn synthetic(cards: usize) -> serde_json::Value {
    // Same generator as src-tauri/src/lib.rs tests::synthetic_fsrs_items
    let mut seed: u64 = 42;
    let mut rand = move || {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((seed >> 33) as f64) / ((1u64 << 31) as f64)
    };
    let items: Vec<serde_json::Value> = (0..cards)
        .map(|_| {
            let first = 1 + (rand() * 4.0) as u32;
            let mut stability = [0.4, 1.2, 3.0, 8.0][first as usize - 1];
            let mut reviews = vec![serde_json::json!({ "rating": first, "deltaT": 0 })];
            for _ in 0..(3 + (rand() * 6.0) as usize) {
                let delta_t = ((stability * (0.6 + rand() * 0.8)).round() as u32).max(1);
                let recall = (1.0 + delta_t as f64 / (9.0 * stability)).powf(-1.0);
                let rating = if rand() < recall {
                    let r = rand();
                    if r < 0.15 { 2 } else if r < 0.9 { 3 } else { 4 }
                } else {
                    1
                };
                stability = match rating {
                    1 => (stability * 0.3).max(0.3),
                    2 => stability * 1.4,
                    3 => stability * 2.5,
                    _ => stability * 3.5,
                };
                reviews.push(serde_json::json!({ "rating": rating, "deltaT": delta_t }));
            }
            serde_json::json!({ "reviews": reviews })
        })
        .collect();
    serde_json::Value::Array(items)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("gen") => println!("{}", synthetic(args.get(2).and_then(|n| n.parse().ok()).unwrap_or(400))),
        Some("opt") => {
            let mut input = String::new();
            std::io::stdin().read_to_string(&mut input).unwrap();
            println!("{}", myenglish_fsrs_wasm::optimize_json(&input));
        }
        _ => eprintln!("usage: parity gen <cards> | parity opt < items.json"),
    }
}
