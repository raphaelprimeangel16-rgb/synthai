import { useState, useEffect, useRef } from "react";

const STABILITY_KEY = import.meta.env.VITE_STABILITY_KEY; // 👈 Your stability.ai key here

const PROMPT_SUGGESTIONS = [
  "A dragon flying over a neon cyberpunk city at night",
  "An astronaut riding a horse on Mars, cinematic",
  "A magical forest with glowing mushrooms and fairies",
  "A futuristic Tokyo street in heavy rain, neon reflections",
  "A giant robot walking through ancient ruins at sunset",
  "An underwater city with bioluminescent sea creatures",
  "A samurai standing in a field of cherry blossoms",
  "A cozy cabin in a snowy mountain during a blizzard",
  "A phoenix rising from flames, epic fantasy art",
  "A steampunk airship flying above the clouds",
];

const STYLES = ["cinematic", "anime", "photographic", "digital-art", "fantasy-art", "neon-punk", "comic-book", "pixel-art", "3d-model", "analog-film", "line-art"];

const DIMENSIONS = [
  { label: "1:1 Square", w: 1024, h: 1024 },
  { label: "16:9 Wide", w: 1216, h: 832 },
  { label: "9:16 Portrait", w: 832, h: 1216 },
  { label: "4:3 Classic", w: 1152, h: 896 },
];

const PAGES = ["GENERATE", "IMG2IMG", "SUGGESTIONS", "GALLERY"];

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [images, setImages] = useState([]);
  const [gallery, setGallery] = useState(() => {
    try { return JSON.parse(localStorage.getItem("synthai_gallery")) || []; }
    catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [page, setPage] = useState("GENERATE");
  const [numImages, setNumImages] = useState(1);
  const [dimension, setDimension] = useState(DIMENSIONS[0]);
  const [copied, setCopied] = useState(false);

  // Img2Img state
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImageFile, setUploadedImageFile] = useState(null);
  const [img2imgStrength, setImg2imgStrength] = useState(0.5);
  const [img2imgPrompt, setImg2imgPrompt] = useState("");
  const [img2imgResult, setImg2imgResult] = useState(null);
  const [img2imgLoading, setImg2imgLoading] = useState(false);
  const [img2imgError, setImg2imgError] = useState("");
  const fileInputRef = useRef(null);

  // Save gallery to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem("synthai_gallery", JSON.stringify(gallery.slice(0, 50))); }
    catch {}
  }, [gallery]);

  async function generate() {
    if (!prompt.trim()) { setError("Please type a prompt first!"); return; }
    if (STABILITY_KEY === "PASTE_YOUR_STABILITY_KEY_HERE") { setError("Please add your Stability AI key!"); return; }
    setLoading(true); setError(""); setImages([]);
    try {
      const response = await fetch(
        "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${STABILITY_KEY}` },
          body: JSON.stringify({
            text_prompts: [{ text: prompt, weight: 1 }, ...(negativePrompt.trim() ? [{ text: negativePrompt, weight: -1 }] : [])],
            cfg_scale: 7, height: dimension.h, width: dimension.w, samples: numImages, steps: 30, style_preset: style,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) { setError("API Error: " + (data.message || "Something went wrong")); }
      else {
        const urls = data.artifacts.map((img) => `data:image/png;base64,${img.base64}`);
        setImages(urls);
        const newItems = urls.map((url) => ({ url, prompt, style, dimension: dimension.label, time: new Date().toLocaleTimeString(), type: "txt2img" }));
        setGallery((prev) => [...newItems, ...prev]);
      }
    } catch { setError("Something went wrong. Check your API key and try again."); }
    setLoading(false);
  }

  function resizeImageToValid(file, targetW, targetH) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, targetW, targetH);
        canvas.toBlob((blob) => resolve(blob), "image/png");
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function getNearestDimension(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        const valid = [
          { w: 1024, h: 1024 }, { w: 1152, h: 896 }, { w: 1216, h: 832 },
          { w: 1344, h: 768 }, { w: 1536, h: 640 }, { w: 640, h: 1536 },
          { w: 768, h: 1344 }, { w: 832, h: 1216 }, { w: 896, h: 1152 },
        ];
        let best = valid[0];
        let bestDiff = Math.abs(ratio - valid[0].w / valid[0].h);
        valid.forEach((d) => {
          const diff = Math.abs(ratio - d.w / d.h);
          if (diff < bestDiff) { bestDiff = diff; best = d; }
        });
        resolve(best);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function generateImg2Img() {
    if (!img2imgPrompt.trim()) { setImg2imgError("Please type a prompt!"); return; }
    if (!uploadedImageFile) { setImg2imgError("Please upload an image first!"); return; }
    if (STABILITY_KEY === "PASTE_YOUR_STABILITY_KEY_HERE") { setImg2imgError("Please add your Stability AI key!"); return; }
    setImg2imgLoading(true); setImg2imgError(""); setImg2imgResult(null);
    try {
      const formData = new FormData();
      const bestDim = await getNearestDimension(uploadedImageFile);
    const resizedBlob = await resizeImageToValid(uploadedImageFile, bestDim.w, bestDim.h);
    formData.append("init_image", resizedBlob, "image.png");
      formData.append("init_image_mode", "IMAGE_STRENGTH");
      formData.append("image_strength", img2imgStrength);
      formData.append("text_prompts[0][text]", img2imgPrompt);
      formData.append("text_prompts[0][weight]", "1");
      formData.append("cfg_scale", "7");
      formData.append("samples", "1");
      formData.append("steps", "30");
      formData.append("style_preset", style);

      const response = await fetch(
        "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image",
        { method: "POST", headers: { Accept: "application/json", Authorization: `Bearer ${STABILITY_KEY}` }, body: formData }
      );
      const data = await response.json();
      if (!response.ok) { setImg2imgError("API Error: " + (data.message || "Something went wrong")); }
      else {
        const url = `data:image/png;base64,${data.artifacts[0].base64}`;
        setImg2imgResult(url);
        setGallery((prev) => [{ url, prompt: img2imgPrompt, style, dimension: "IMG2IMG", time: new Date().toLocaleTimeString(), type: "img2img" }, ...prev]);
      }
    } catch { setImg2imgError("Something went wrong. Try again."); }
    setImg2imgLoading(false);
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setUploadedImage(ev.target.result);
    reader.readAsDataURL(file);
  }

  function downloadImage(url, index) {
    const link = document.createElement("a");
    link.href = url; link.download = `synthai-${index + 1}.png`; link.click();
  }

  function copyPrompt() {
    navigator.clipboard.writeText(prompt);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  function clearGallery() {
    if (window.confirm("Clear all saved images?")) { setGallery([]); }
  }

  return (
    <div style={s.hub}>
      <div style={s.gridBg} />
      <div style={s.topbar}>
        <div style={s.logo}>SYNTH<span style={{ color: "#00e5ff" }}>AI</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PAGES.map((p) => (
            <button key={p} onClick={() => setPage(p)} style={{ ...s.navBtn, ...(page === p ? s.navActive : {}) }}>
              {p}{p === "GALLERY" && gallery.length > 0 && <span style={s.galleryBadge}>{gallery.length}</span>}
            </button>
          ))}
        </div>
        <div style={s.statusDot}><div style={s.dot} />ALL SYSTEMS ONLINE</div>
      </div>

      <div style={s.main}>

        {/* SUGGESTIONS */}
        {page === "SUGGESTIONS" && (
          <div style={s.card}>
            <div style={s.label}>// PROMPT SUGGESTIONS</div>
            <p style={s.hint}>Click any prompt to load it into the generator!</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {PROMPT_SUGGESTIONS.map((p, i) => (
                <div key={i} onClick={() => { setPrompt(p); setPage("GENERATE"); }} style={s.suggestionRow}>
                  <span style={s.suggestionNum}>0{i + 1}</span>
                  <span style={s.suggestionText}>{p}</span>
                  <span style={s.suggestionArrow}>→</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GALLERY */}
        {page === "GALLERY" && (
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={s.label}>// IMAGE GALLERY — {gallery.length} IMAGES SAVED</div>
              {gallery.length > 0 && <button onClick={clearGallery} style={s.clearBtn}>🗑 Clear All</button>}
            </div>
            {gallery.length === 0 ? (
              <div style={s.emptyState}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🖼️</div>
                <div style={s.emptyText}>No images yet — go generate some!</div>
              </div>
            ) : (
              <div style={s.galleryGrid}>
                {gallery.map((item, i) => (
                  <div key={i} style={s.galleryCard}>
                    <img src={item.url} alt={item.prompt} style={s.galleryImg} />
                    <div style={s.galleryInfo}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        <span style={{ ...s.typeBadge, background: item.type === "img2img" ? "rgba(0,200,150,0.15)" : "rgba(30,100,255,0.15)", color: item.type === "img2img" ? "#00e5aa" : "#4d9fff", border: item.type === "img2img" ? "1px solid rgba(0,200,150,0.3)" : "1px solid rgba(30,100,255,0.3)" }}>{item.type === "img2img" ? "IMG2IMG" : "TXT2IMG"}</span>
                      </div>
                      <div style={s.galleryPrompt}>{item.prompt.length > 50 ? item.prompt.slice(0, 50) + "..." : item.prompt}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={s.galleryMeta}>{item.style} · {item.time}</span>
                        <button onClick={() => downloadImage(item.url, i)} style={s.downloadBtn}>⬇ Save</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* IMG2IMG */}
        {page === "IMG2IMG" && (
          <div style={s.card}>
            <div style={s.label}>// IMAGE TO IMAGE</div>
            <p style={s.hint}>Upload an image and transform it with AI using a prompt!</p>

            <div style={s.uploadBox} onClick={() => fileInputRef.current.click()}>
              {uploadedImage ? (
                <img src={uploadedImage} alt="Uploaded" style={{ maxHeight: 200, maxWidth: "100%", borderRadius: 4 }} />
              ) : (
                <div style={{ textAlign: "center", color: "#5a7a9a" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                  <div style={{ fontSize: 12, letterSpacing: 1 }}>CLICK TO UPLOAD IMAGE</div>
                  <div style={{ fontSize: 11, marginTop: 4, color: "#3a5a7a" }}>JPG, PNG supported</div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
            </div>

            <div style={s.label2}>// TRANSFORMATION PROMPT</div>
            <textarea
              style={s.textarea} rows={2}
              placeholder="Describe how to transform the image... e.g. 'Turn into anime style' or 'Make it look like a painting'"
              value={img2imgPrompt}
              onChange={(e) => setImg2imgPrompt(e.target.value)}
            />

            <div style={s.label2}>// STYLE</div>
            <div style={s.styleRow}>
              {STYLES.map((st) => (
                <div key={st} onClick={() => setStyle(st)} style={{ ...s.styleChip, border: style === st ? "1px solid #4d9fff" : "1px solid rgba(30,100,255,0.2)", background: style === st ? "rgba(30,100,255,0.2)" : "rgba(5,10,20,0.8)", color: style === st ? "#4d9fff" : "#7aa8d8" }}>{st}</div>
              ))}
            </div>

            <div style={s.label2}>// TRANSFORMATION STRENGTH <span style={s.labelHint}>(how much to change — 0 = subtle, 1 = drastic)</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <input type="range" min="0.1" max="0.9" step="0.1" value={img2imgStrength} onChange={(e) => setImg2imgStrength(parseFloat(e.target.value))} style={{ flex: 1, accentColor: "#4d9fff" }} />
              <span style={{ color: "#4d9fff", fontFamily: "monospace", fontSize: 14, minWidth: 30 }}>{img2imgStrength}</span>
            </div>

            {img2imgError && <div style={s.error}>⚠️ {img2imgError}</div>}

            <button onClick={generateImg2Img} disabled={img2imgLoading} style={{ ...s.genBtn, width: "100%", opacity: img2imgLoading ? 0.5 : 1 }}>
              {img2imgLoading ? "⟳ TRANSFORMING..." : "▶ TRANSFORM IMAGE"}
            </button>

            {img2imgLoading && (
              <div style={{ ...s.loadingWrap, marginTop: 16 }}>
                <div style={s.loadingBar}><div style={s.loadingFill} /></div>
                <div style={s.loadingText}>Transforming your image... ~15 seconds</div>
              </div>
            )}

            {img2imgResult && (
              <div style={{ marginTop: 16 }}>
                <div style={s.label}>// RESULT</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#5a7a9a", marginBottom: 6, letterSpacing: 1 }}>ORIGINAL</div>
                    <img src={uploadedImage} alt="Original" style={{ width: "100%", borderRadius: 4, border: "1px solid rgba(30,100,255,0.2)" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#00e5aa", marginBottom: 6, letterSpacing: 1 }}>TRANSFORMED</div>
                    <img src={img2imgResult} alt="Result" style={{ width: "100%", borderRadius: 4, border: "1px solid rgba(0,229,170,0.3)" }} />
                    <button onClick={() => downloadImage(img2imgResult, 0)} style={{ ...s.downloadBtn, marginTop: 8, display: "block" }}>⬇ Save Result</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* GENERATE */}
        {page === "GENERATE" && (
          <>
            <div style={s.card}>
              <div style={s.label}>// PROMPT MATRIX</div>
              <div style={{ position: "relative" }}>
                <textarea style={s.textarea} rows={3} placeholder="Describe your vision... or click SUGGESTIONS!" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                <button onClick={copyPrompt} style={s.copyBtn}>{copied ? "✅ Copied!" : "📋 Copy"}</button>
              </div>

              <div style={s.label2}>// NEGATIVE PROMPT <span style={s.labelHint}>(what to EXCLUDE)</span></div>
              <textarea style={{ ...s.textarea, borderColor: "rgba(255,80,80,0.2)" }} rows={2} placeholder="e.g. blurry, ugly, bad anatomy, watermark..." value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} />

              <div style={s.label2}>// SELECT STYLE</div>
              <div style={s.styleRow}>
                {STYLES.map((st) => (
                  <div key={st} onClick={() => setStyle(st)} style={{ ...s.styleChip, border: style === st ? "1px solid #4d9fff" : "1px solid rgba(30,100,255,0.2)", background: style === st ? "rgba(30,100,255,0.2)" : "rgba(5,10,20,0.8)", color: style === st ? "#4d9fff" : "#7aa8d8" }}>{st}</div>
                ))}
              </div>

              <div style={s.label2}>// IMAGE DIMENSIONS</div>
              <div style={s.styleRow}>
                {DIMENSIONS.map((d) => (
                  <div key={d.label} onClick={() => setDimension(d)} style={{ ...s.styleChip, border: dimension.label === d.label ? "1px solid #00e5aa" : "1px solid rgba(30,100,255,0.2)", background: dimension.label === d.label ? "rgba(0,229,170,0.1)" : "rgba(5,10,20,0.8)", color: dimension.label === d.label ? "#00e5aa" : "#7aa8d8" }}>{d.label}</div>
                ))}
              </div>

              <div style={s.label2}>// NUMBER OF IMAGES</div>
              <div style={s.styleRow}>
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} onClick={() => setNumImages(n)} style={{ ...s.styleChip, border: numImages === n ? "1px solid #b06aff" : "1px solid rgba(30,100,255,0.2)", background: numImages === n ? "rgba(150,50,255,0.15)" : "rgba(5,10,20,0.8)", color: numImages === n ? "#b06aff" : "#7aa8d8" }}>
                    {n} {n === 1 ? "IMAGE" : "IMAGES"}
                  </div>
                ))}
              </div>

              {error && <div style={s.error}>⚠️ {error}</div>}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setPage("SUGGESTIONS")} style={s.suggBtn}>💡 Ideas</button>
                <button onClick={generate} disabled={loading} style={{ ...s.genBtn, opacity: loading ? 0.5 : 1, flex: 1 }}>
                  {loading ? `⟳ GENERATING...` : `▶ GENERATE ${numImages} IMAGE${numImages > 1 ? "S" : ""}`}
                </button>
              </div>
            </div>

            <div style={s.card}>
              <div style={s.label}>// OUTPUT STREAM</div>
              {loading && (<div style={s.loadingWrap}><div style={s.loadingBar}><div style={s.loadingFill} /></div><div style={s.loadingText}>Generating {numImages} image{numImages > 1 ? "s" : ""}... ~{numImages * 15} seconds</div></div>)}
              {images.length === 0 && !loading && (<div style={s.emptyState}><div style={{ fontSize: 40, marginBottom: 10 }}>🎨</div><div style={s.emptyText}>Awaiting prompt input...</div></div>)}
              <div style={s.imagesGrid}>
                {images.map((url, i) => (
                  <div key={i} style={s.imageCard}>
                    <img src={url} alt="Generated" style={s.generatedImg} />
                    <div style={s.imgFooter}>
                      <span style={s.modelName}>#{i + 1} · {style} · {dimension.label}</span>
                      <button onClick={() => downloadImage(url, i)} style={s.downloadBtn}>⬇ Save</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  hub: { background: "#080b14", minHeight: "100vh", fontFamily: "monospace", color: "#c8d8f0", position: "relative" },
  gridBg: { position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(30,100,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(30,100,255,0.04) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: "1px solid rgba(30,100,255,0.2)", background: "rgba(8,11,20,0.95)", position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap", gap: 10 },
  logo: { fontSize: 20, fontWeight: 700, color: "#4d9fff", letterSpacing: 3 },
  navBtn: { padding: "7px 16px", background: "transparent", border: "1px solid rgba(30,100,255,0.3)", borderRadius: 3, color: "#7aa8d8", fontFamily: "monospace", fontSize: 11, letterSpacing: 1, cursor: "pointer" },
  navActive: { background: "rgba(30,100,255,0.2)", color: "#4d9fff", borderColor: "#4d9fff" },
  galleryBadge: { background: "#4d9fff", color: "#000", borderRadius: 10, padding: "1px 6px", fontSize: 10, marginLeft: 6 },
  statusDot: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, letterSpacing: 1, color: "#00e5aa" },
  dot: { width: 7, height: 7, borderRadius: "50%", background: "#00e5aa" },
  main: { padding: "24px 28px", maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 },
  card: { background: "rgba(10,18,35,0.9)", border: "1px solid rgba(30,100,255,0.25)", borderRadius: 6, padding: 20 },
  label: { fontSize: 10, letterSpacing: 2, color: "#4d9fff", marginBottom: 10, textTransform: "uppercase" },
  label2: { fontSize: 10, letterSpacing: 2, color: "#4d9fff", marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
  labelHint: { color: "#5a7a9a", textTransform: "none", letterSpacing: 0, fontSize: 10 },
  hint: { fontSize: 12, color: "#5a7a9a", marginBottom: 14 },
  textarea: { width: "100%", background: "rgba(5,10,20,0.8)", border: "1px solid rgba(30,100,255,0.2)", borderRadius: 4, color: "#c8d8f0", fontFamily: "monospace", fontSize: 14, padding: "12px 16px", resize: "none", outline: "none", boxSizing: "border-box" },
  copyBtn: { position: "absolute", top: 8, right: 8, padding: "4px 10px", background: "rgba(30,100,255,0.15)", border: "1px solid rgba(30,100,255,0.3)", borderRadius: 3, color: "#4d9fff", fontFamily: "monospace", fontSize: 11, cursor: "pointer", letterSpacing: 1 },
  styleRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  styleChip: { padding: "6px 14px", borderRadius: 3, fontSize: 11, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" },
  error: { color: "#ff6b6b", fontSize: 12, margin: "12px 0", padding: "8px 12px", background: "rgba(255,50,50,0.1)", borderRadius: 4, border: "1px solid rgba(255,50,50,0.2)" },
  suggBtn: { padding: "12px 16px", background: "rgba(30,100,255,0.1)", border: "1px solid rgba(30,100,255,0.3)", borderRadius: 4, color: "#4d9fff", fontFamily: "monospace", fontSize: 12, cursor: "pointer", letterSpacing: 1 },
  genBtn: { padding: "12px", background: "linear-gradient(135deg, #1a4fff 0%, #0091cc 100%)", border: "none", borderRadius: 4, color: "#fff", fontFamily: "monospace", fontSize: 13, letterSpacing: 2, cursor: "pointer", textTransform: "uppercase" },
  loadingWrap: { marginBottom: 16 },
  loadingBar: { height: 2, background: "rgba(30,100,255,0.1)", borderRadius: 2, marginBottom: 8, overflow: "hidden" },
  loadingFill: { height: "100%", width: "40%", background: "linear-gradient(90deg, #4d9fff, #00e5ff)", borderRadius: 2 },
  loadingText: { fontSize: 11, color: "#5a7a9a", letterSpacing: 1, textAlign: "center" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", color: "rgba(120,160,220,0.25)" },
  emptyText: { fontSize: 12, letterSpacing: 2, textTransform: "uppercase" },
  imagesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 },
  imageCard: { border: "1px solid rgba(30,100,255,0.2)", borderRadius: 4, overflow: "hidden" },
  generatedImg: { width: "100%", display: "block" },
  imgFooter: { padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  modelName: { fontSize: 10, letterSpacing: 1, color: "#4d9fff" },
  downloadBtn: { color: "#4d9fff", fontSize: 11, background: "none", border: "none", cursor: "pointer", letterSpacing: 1, fontFamily: "monospace" },
  suggestionRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(5,10,20,0.8)", border: "1px solid rgba(30,100,255,0.15)", borderRadius: 4, cursor: "pointer" },
  suggestionNum: { fontSize: 11, color: "#4d9fff", letterSpacing: 1, minWidth: 24 },
  suggestionText: { flex: 1, fontSize: 13, color: "#c8d8f0" },
  suggestionArrow: { color: "#4d9fff", fontSize: 16 },
  galleryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 },
  galleryCard: { border: "1px solid rgba(30,100,255,0.2)", borderRadius: 4, overflow: "hidden" },
  galleryImg: { width: "100%", display: "block" },
  galleryInfo: { padding: "10px 12px" },
  galleryPrompt: { fontSize: 11, color: "#c8d8f0", lineHeight: 1.4 },
  galleryMeta: { fontSize: 10, color: "#5a7a9a", letterSpacing: 1 },
  typeBadge: { fontSize: 9, padding: "2px 6px", borderRadius: 2, letterSpacing: 1 },
  uploadBox: { border: "2px dashed rgba(30,100,255,0.3)", borderRadius: 6, padding: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 4, minHeight: 120, background: "rgba(5,10,20,0.5)" },
  clearBtn: { padding: "4px 12px", background: "rgba(255,50,50,0.1)", border: "1px solid rgba(255,50,50,0.3)", borderRadius: 3, color: "#ff6b6b", fontFamily: "monospace", fontSize: 11, cursor: "pointer" },
};
