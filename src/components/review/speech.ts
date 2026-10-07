/** Text-To-Speech (one implementation for the whole app); accepts a click event (stops propagation) or a speech rate */
export function handleSpeak(text: string, eOrRate?: React.MouseEvent | number) {
  let rate = 0.9;
  if (typeof eOrRate === "number") {
    rate = eOrRate;
  } else if (eOrRate) {
    eOrRate.stopPropagation();
  }
  if (!text.trim()) return;
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = rate;
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.warn("Speech synthesis error:", e);
  }
}
