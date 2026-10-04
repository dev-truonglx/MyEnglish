/** Text-To-Speech for review cards; accepts a click event (stops propagation) or an explicit speech rate */
export function handleSpeak(text: string, eOrRate?: React.MouseEvent | number) {
  let rate = 0.9;
  if (typeof eOrRate === "number") {
    rate = eOrRate;
  } else if (eOrRate) {
    eOrRate.stopPropagation();
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  }
}
