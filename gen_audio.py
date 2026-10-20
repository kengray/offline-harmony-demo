# Makes the dummy stems: 2 songs x 4 voices, 12 s mono WAV. Run from this folder: python3 gen_audio.py
import wave, struct, math, os
D="audio"; os.makedirs(D,exist_ok=True)
sr=22050; dur=12
voices={"guitar":[196,247,294,247],"lead":[392,440,494,440],"tenor":[494,523,587,523],"baritone":[262,294,330,294]}
for s,m in {"song-a":1.0,"song-b":1.25}.items():
    for v,notes in voices.items():
        w=wave.open(f"{D}/{s}-{v}.wav","wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        fr=bytearray()
        for i in range(sr*dur):
            t=i/sr; n=notes[int(t)%4]*m; env=0.5*(1-((t%1.0))*0.6)
            fr+=struct.pack("<h",int(9000*env*math.sin(2*math.pi*n*t)))
        w.writeframes(bytes(fr)); w.close()
