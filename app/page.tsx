"use client";

import { useState } from "react";

type Candidate = {
  discogsId: number;
  title: string;
  year: string | null;
  formats: string[];
  label: string | null;
  thumb: string | null;
};
type Result =
  | { status: "ok"; guess: { artist: string; title: string; confidence: string }; candidates: Candidate[] }
  | { status: "lookup_unavailable" | "not_recognised"; guess: { artist: string | null; title: string | null; confidence: string } }
  | { status: "ai_unavailable" | "bad_request"; message?: string };

// Förminska innan uppladdning: billigare AI-anrop, snabbare, och under Vercels body-gräns.
async function resize(file: File, maxSide = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.8),
  );
}

export default function Home() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Candidate | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setResult(null);
    setChosen(null);
    try {
      const body = new FormData();
      body.set("image", await resize(file), "cover.jpg");
      const res = await fetch("/api/identify", { method: "POST", body });
      setResult(await res.json());
    } catch {
      setResult({ status: "ai_unavailable" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <h1>Arkivet</h1>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={busy}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {busy && <p>Läser omslaget…</p>}

      {result?.status === "ai_unavailable" && <p>Bildigenkänningen svarar inte just nu. Försök igen strax.</p>}
      {result?.status === "bad_request" && <p>{result.message}</p>}
      {result?.status === "not_recognised" && <p>Kunde inte läsa omslaget säkert. Prova en skarpare bild.</p>}
      {result?.status === "lookup_unavailable" && (
        <p>
          Databasen svarar inte just nu. AI:n tror att det är {result.guess.artist} – {result.guess.title}.
        </p>
      )}

      {result?.status === "ok" && (
        <>
          <p>
            AI:n föreslår: <b>{result.guess.artist} – {result.guess.title}</b> ({result.guess.confidence}). Välj rätt träff:
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {result.candidates.map((c) => (
              <li key={c.discogsId} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {c.thumb && <img src={c.thumb} alt="" width={56} height={56} />}
                <div style={{ flex: 1 }}>
                  {c.title} {c.year && `(${c.year})`}
                  <br />
                  <small>{[c.formats.join(", "), c.label].filter(Boolean).join(" · ")}</small>
                </div>
                <button onClick={() => setChosen(c)}>Det här</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {chosen && <p>Valt: {chosen.title}. (Sparas i databasen i nästa steg.)</p>}
    </main>
  );
}
