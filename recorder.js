export class VoiceRecorder {
  constructor(onTick,onEnd) {this.onTick=onTick;this.onEnd=onEnd;this.recorder=null;this.active=false;this.starting=false;this.interrupted=false;this.token=0;this.stream=null;}
  async start() {
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('当前环境不能录音。请通过HTTPS或本机预览打开，也可以先记文字。');
    const token=++this.token;this.starting=true;
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(token!==this.token){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;const type=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
      this.recorder=new MediaRecorder(stream,type?{mimeType:type,audioBitsPerSecond:48000}:undefined);
      this.chunks=[];this.interrupted=false;this.startAt=performance.now();this.active=true;this.starting=false;
      this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
      this.recorder.onerror=()=>{this.interrupted=true;this.stop();};
      this.recorder.onstop=()=>{
        clearInterval(this.timer);stream.getTracks().forEach(t=>t.stop());this.active=false;
        const blob=new Blob(this.chunks,{type:this.recorder.mimeType||type||'audio/webm'});
        this.onEnd({blob,duration:Math.min(180,Math.max(.1,(performance.now()-this.startAt)/1000)),interrupted:this.interrupted});
      };
      stream.getAudioTracks().forEach(t=>t.onended=()=>{if(this.active)this.stop(true);});
      this.recorder.start(500);this.onTick(0);
      this.timer=setInterval(()=>{const elapsed=(performance.now()-this.startAt)/1000;this.onTick(elapsed);if(elapsed>=180)this.stop();},250);
    }catch(e){this.starting=false;this.stream?.getTracks().forEach(t=>t.stop());this.active=false;throw new Error(e.name==='NotAllowedError'?'麦克风未获授权。可以在浏览器设置中允许，也可以改用文字记录。':e.name==='NotFoundError'?'没有找到可用麦克风，可以先记文字。':'录音未能开始，请检查麦克风后重试。');}
  }
  stop(interrupted=false) {this.interrupted||=interrupted;if(this.recorder?.state==='recording')this.recorder.stop();}
  cancel() {++this.token;this.starting=false;this.onEnd=()=>{};clearInterval(this.timer);this.stop();this.stream?.getTracks().forEach(t=>t.stop());this.active=false;}
}
