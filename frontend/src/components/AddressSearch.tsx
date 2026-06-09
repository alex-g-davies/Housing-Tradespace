import { type FormEvent, useState } from "react";

import { getGeocode } from "../api/client";

interface Props {
  /** Called with the geocoded work location and a human-readable label. */
  onLocated: (lat: number, lon: number, label: string) => void;
}

type Status = "idle" | "loading" | "error" | "ok";

/** Free-text address search that geocodes via the backend and moves the work
 * location to the result. */
export default function AddressSearch({ onLocated }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setStatus("loading");
    setMsg("");
    try {
      const r = await getGeocode(query);
      onLocated(r.lat, r.lon, r.place_name);
      setStatus("ok");
      setMsg(r.place_name);
    } catch (err) {
      setStatus("error");
      setMsg(
        (err as Error).message === "not_found"
          ? "No match for that address."
          : "Address search unavailable.",
      );
    }
  }

  return (
    <form className="address" onSubmit={submit}>
      <label className="address__label" htmlFor="address-input">
        Find a work address
      </label>
      <div className="address__row">
        <input
          id="address-input"
          className="address__input"
          type="text"
          placeholder="e.g. 400 Broad St, Seattle"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="address__btn" type="submit" disabled={status === "loading"}>
          {status === "loading" ? "…" : "Go"}
        </button>
      </div>
      {msg && (
        <span className={status === "error" ? "address__msg address__msg--error" : "address__msg"}>
          {msg}
        </span>
      )}
    </form>
  );
}
