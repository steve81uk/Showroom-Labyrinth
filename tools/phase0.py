import json, re, numpy as np, librosa, scipy.signal as ss
FPS=30
y,sr=librosa.load('audio_master.wav',sr=48000,mono=True)
dur=len(y)/sr; N=int(np.ceil(dur*FPS))
hop=sr//FPS  # 1600 samples -> one value per video frame
# beats: track at the 179 grid (Suno) and confirm
oenv=librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop)
tempo,beats=librosa.beat.beat_track(onset_envelope=oenv,sr=sr,hop_length=hop,start_bpm=179,tightness=400,units='time')
tempo=float(np.atleast_1d(tempo)[0])
suno=json.load(open('../suno_analysis_summary.json'))
# envelopes per frame
def band_env(lo,hi):
    sos=ss.butter(4,[lo,hi] if lo>0 else hi,btype='band' if lo>0 else 'low',fs=sr,output='sos')
    z=ss.sosfiltfilt(sos,y); fr=librosa.util.frame(np.pad(z,(0,hop*N+hop-len(z)+hop)),frame_length=hop,hop_length=hop)[:, :N]
    e=np.sqrt((fr**2).mean(0)); return (e/ (np.percentile(e,99)+1e-9)).clip(0,1)
kick=band_env(0,120); bass=band_env(40,250); hats=band_env(6000,16000); mid=band_env(300,3000)
on=oenv[:N]; on=(on/np.percentile(on,99)).clip(0,1)
rms=librosa.feature.rms(y=y,frame_length=hop*2,hop_length=hop)[0][:N]; rms=(rms/rms.max())
# transients: kick peaks
pk,_=ss.find_peaks(kick,height=0.45,distance=5)
# words from Suno alignment
A=json.loads(json.load(open('../alignment_raw.json'))[0]['text'])['words']
words=[];lines=[];cur=None;section=None;sections=[]
for w in A:
    t=w['word']
    heads=re.findall(r'\[([^\]]+)\]',t)
    for h in heads:
        if not h.startswith('All vocals'): sections.append(dict(name=h.split(':')[0].strip(),detail=h,start_s=w['start_s']))
    t=re.sub(r'\[[^\]]*\]','',t)
    newline='\n' in t
    clean=t.replace('\n',' ').strip()
    if newline or cur is None:
        if cur: lines.append(cur)
        cur=dict(text='',start_s=w['start_s'],end_s=w['end_s'],section=sections[-1]['name'] if sections else 'Intro')
    if clean:
        glue = not t.startswith((' ','\n')) and cur['text']!=''
        cur['text']+=('' if glue else (' ' if cur['text'] else ''))+clean
        cur['end_s']=w['end_s']
        words.append(dict(w=clean,start_s=round(w['start_s'],3),end_s=round(w['end_s'],3),frame=int(round(w['start_s']*FPS)),glued=glue))
lines.append(cur)
lines=[l for l in lines if l['text']]
# sections end times
for i,s in enumerate(sections): s['end_s']=sections[i+1]['start_s'] if i+1<len(sections) else dur
# merge 'Final sung punchline' etc into Outro display
json.dump(dict(fps=FPS,duration_s=dur,total_frames=N,tempo_librosa=tempo,beats_s=[round(b,4) for b in beats],
  onset_env_30fps=[round(float(x),3) for x in on],kick_env_30fps=[round(float(x),3) for x in kick],bass_env_30fps=[round(float(x),3) for x in bass],
  hats_env_30fps=[round(float(x),3) for x in hats],rms_30fps=[round(float(x),3) for x in rms],kick_frames=[int(p) for p in pk],
  words=words,lines=lines,sections=sections),open('analysis/acoustic.json','w'))
ib=np.diff(beats); print('duration',dur,'frames',N,'librosa tempo',round(tempo,2),'beats',len(beats),'median interval',round(float(np.median(ib)),4),'->',round(60/np.median(ib),2),'BPM')
print('suno grid',suno['bpm_grid'],'interval',suno['beat_interval_s'])
print('words',len(words),'lines',len(lines),'kicks',len(pk))
for s in sections: print(f"{s['start_s']:7.2f}-{s['end_s']:7.2f} {s['name']}")
for l in lines[:6]: print(round(l['start_s'],2),l['text'])
