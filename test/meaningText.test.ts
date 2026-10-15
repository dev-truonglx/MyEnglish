import { describe, it, expect } from "vitest";
import { getConciseMeaning } from "@/services/meaningText";

describe("getConciseMeaning", () => {
  it("extracts primary sense for words with multiple senses separated by semicolons", () => {
    // The exact word from the user prompt:
    const his = "của anh ấy, của ông ấy; của anh ấy, của ông ấy (đứng một mình, không kèm danh từ)";
    expect(getConciseMeaning(his, "his")).toBe("Của anh ấy, của ông ấy");

    const of = "của (sở hữu, liên hệ); trong số (một phần của nhóm); không dịch (nối lượng, đơn vị với danh từ)";
    expect(getConciseMeaning(of, "of")).toBe("Của (sở hữu, liên hệ)");

    const one = "một (số 1); một (người, vật trong nhóm); một cái, một người (thay cho danh từ đã nhắc)";
    expect(getConciseMeaning(one, "one")).toBe("Một (số 1)");

    const could = "có thể, đã có thể (khả năng trong quá khứ); có thể … không (đề nghị, yêu cầu lịch sự)";
    expect(getConciseMeaning(could, "could")).toBe("Có thể, đã có thể (khả năng trong quá khứ)");

    const take = "cầm, lấy, mang theo; đưa; đi (bằng phương tiện); uống, dùng thuốc; mất (thời gian)";
    expect(getConciseMeaning(take, "take")).toBe("Cầm, lấy, mang theo");
  });

  it("does not strip valid Vietnamese words starting with 'trong' or 'làm'", () => {
    expect(getConciseMeaning("làm; khiến, làm cho; hãng, nhãn hiệu", "make")).toBe("Làm");
    expect(getConciseMeaning("trong nhà", "indoor")).toBe("Trong nhà");
    expect(getConciseMeaning("trong lúc đó", "meanwhile")).toBe("Trong lúc đó");
    expect(getConciseMeaning("trong vòng; trong phạm vi", "within")).toBe("Trong vòng");
  });

  it("preserves loanwords identical to targetWord instead of emptying them", () => {
    expect(getConciseMeaning("video", "video")).toBe("Video");
    expect(getConciseMeaning("euro", "euro")).toBe("Euro");
    expect(getConciseMeaning("inch", "inch")).toBe("Inch");
  });

  it("strips AI preamble phrases cleanly", () => {
    const ai1 = "Trong ngữ cảnh công nghệ thông tin: giao diện người dùng trực quan";
    expect(getConciseMeaning(ai1, "ui")).toBe("Giao diện người dùng trực quan");

    const ai2 = "Từ này có nghĩa là bảng điều khiển trực quan";
    expect(getConciseMeaning(ai2, "dashboard")).toBe("Bảng điều khiển trực quan");
  });

  it("resolves contextual concise meaning when example with sense_index is provided", () => {
    const over = "ở trên, phía trên; qua, sang (phía bên kia); sang, ghé qua (chỗ ai)";
    // Sense 0: lamp over the table
    expect(getConciseMeaning(over, "over", { sentence_vn: "Có một chiếc đèn ở phía trên bàn.", sense_index: 0 }))
      .toBe("Ở trên, phía trên");

    // Sense 1: walked over the bridge
    expect(getConciseMeaning(over, "over", { sentence_vn: "Chúng tôi đi qua cây cầu.", sense_index: 1 }))
      .toBe("Qua, sang (phía bên kia)");

    // Sense 2: Come over and sit with us
    expect(getConciseMeaning(over, "over", { sentence_vn: "Hãy sang đây và ngồi cùng chúng tôi.", sense_index: 2 }))
      .toBe("Sang, ghé qua (chỗ ai)");

    // Clamp out-of-bounds sense_index to the last sense
    expect(getConciseMeaning(over, "over", { sense_index: 99 }))
      .toBe("Sang, ghé qua (chỗ ai)");
  });

  it("falls back to sentence_vn text matching when sense_index is missing", () => {
    const light = "ánh sáng; nhẹ; châm (lửa)";
    expect(getConciseMeaning(light, "light", { sentence_vn: "Cái túi này rất nhẹ." }))
      .toBe("Nhẹ");
  });
});

import { getPosLabel } from "@/components/FocusReviewModal";

describe("getPosLabel", () => {
  it("correctly identifies pronoun and determiner without misidentifying as noun", () => {
    expect(getPosLabel("determiner, pronoun")).toBe("Từ hạn định (determiner), Đại từ (pronoun)");
    expect(getPosLabel("pronoun")).toBe("Đại từ (pronoun)");
    expect(getPosLabel("determiner")).toBe("Từ hạn định (determiner)");
  });

  it("correctly identifies standard parts of speech", () => {
    expect(getPosLabel("noun")).toBe("Danh từ (noun)");
    expect(getPosLabel("verb")).toBe("Động từ (verb)");
    expect(getPosLabel("verb, noun")).toBe("Động từ (verb), Danh từ (noun)");
    expect(getPosLabel("adjective")).toBe("Tính từ (adj)");
    expect(getPosLabel("adverb")).toBe("Trạng từ (adv)");
    expect(getPosLabel("modal verb")).toBe("Động từ khuyết thiếu");
  });
});
