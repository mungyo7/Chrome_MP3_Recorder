// 탭 오디오 스트림을 받아 MediaRecorder로 녹음한다. 녹음 중에도 탭 소리가 스피커로 계속 나오게 한다.
const FORMATS = [
  { mime: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a' },
  { mime: 'audio/mp4', ext: 'm4a' },
  { mime: 'audio/webm;codecs=opus', ext: 'webm' }
];

let recorder = null;
let audioCtx = null;
let saveName = 'tab-audio';

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'start') {
    saveName = msg.name;
    start(msg.streamId);
  }
  if (msg.type === 'stop' && recorder && recorder.state !== 'inactive') recorder.stop();
});

async function start(streamId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false
    });

    audioCtx = new AudioContext();
    audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

    const format = FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime));
    recorder = new MediaRecorder(stream, { mimeType: format.mime, audioBitsPerSecond: 192000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
      const blob = new Blob(chunks, { type: format.mime.split(';')[0] });
      chrome.runtime.sendMessage({ target: 'background', type: 'saved', url: URL.createObjectURL(blob), name: saveName, ext: format.ext });
    };
    // 탭을 닫으면 트랙이 끝나므로 그때도 자동 저장한다.
    stream.getAudioTracks()[0].onended = () => { if (recorder.state !== 'inactive') recorder.stop(); };
    recorder.start(1000);
  } catch (err) {
    console.error(err);
    chrome.runtime.sendMessage({ target: 'background', type: 'error', message: String(err) });
  }
}
