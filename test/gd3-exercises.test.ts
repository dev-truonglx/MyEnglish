import { describe, it, expect } from "vitest";
import { maskTargetInMeaning, pickSenseForExample, samePronunciation, sharesSense } from "@/utils/exerciseHints";

describe("pickSenseForExample (M5)", () => {
  it("picks the sense the Vietnamese example uses", () => {
    expect(pickSenseForExample("ánh sáng; nhẹ; châm (lửa)", "Cái túi này nhỏ và nhẹ.")).toBe("nhẹ");
  });

  it("falls back to the first sense when no sense occurs in the example", () => {
    expect(pickSenseForExample("ánh sáng; nhẹ", "Hôm nay trời đẹp.")).toBe("ánh sáng");
  });

  it("falls back to the first sense without a Vietnamese example", () => {
    expect(pickSenseForExample("ánh sáng; nhẹ", "")).toBe("ánh sáng");
  });

  it("prefers the longest matching sense", () => {
    expect(pickSenseForExample("nhẹ; nhẹ nhàng", "Cô ấy nói nhẹ nhàng.")).toBe("nhẹ nhàng");
  });

  it("matches whole words only, ignoring case", () => {
    // "đi" occurs inside "Điều" but is not a word there
    expect(pickSenseForExample("ăn; đi", "Điều này rất khó.")).toBe("ăn");
    expect(pickSenseForExample("Nhẹ; ánh sáng", "Cái túi này NHẸ.")).toBe("Nhẹ");
  });
});

describe("maskTargetInMeaning (M14)", () => {
  it("blanks every whole-word occurrence of the target", () => {
    expect(maskTargetInMeaning("email; gửi email", "email")).toBe("___; gửi ___");
    expect(maskTargetInMeaning("there (there is, there are)", "there")).toBe("___ (___ is, ___ are)");
  });

  it("does not blank the target inside a longer word", () => {
    expect(maskTargetInMeaning("therefore; vì vậy", "there")).toBe("therefore; vì vậy");
  });

  it("ignores case and handles regex characters in the word", () => {
    expect(maskTargetInMeaning("Email", "email")).toBe("___");
    expect(maskTargetInMeaning("c++ language; ngôn ngữ", "c++")).toBe("___ language; ngôn ngữ");
  });
});

describe("samePronunciation (M15)", () => {
  it("ignores slashes and stress marks", () => {
    expect(samePronunciation("/raɪt/", "raɪt")).toBe(true);
    expect(samePronunciation("/ˈraɪt/", "/raɪt/")).toBe(true);
  });

  it("tells different pronunciations apart", () => {
    expect(samePronunciation("/ˈwɔːtə/", "/ˈwɔːtər/")).toBe(false);
  });

  it("never matches a missing pronunciation", () => {
    expect(samePronunciation(undefined, "/raɪt/")).toBe(false);
    expect(samePronunciation(null, null)).toBe(false);
    expect(samePronunciation("", "")).toBe(false);
  });
});

describe("sharesSense (M5 distractors)", () => {
  it("is true when one sense is listed in both meanings", () => {
    expect(sharesSense("ánh sáng; nhẹ", "gọn gàng; nhẹ")).toBe(true);
  });

  it("is false for different senses", () => {
    expect(sharesSense("ánh sáng; nhẹ", "nhẹ nhàng; êm ái")).toBe(false);
  });
});
