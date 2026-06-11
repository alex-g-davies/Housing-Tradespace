// Shareable-URL codec (spec 009 R5). Pure: parse a query string into validated
// app state, serialize app state back. Invalid params are dropped silently;
// values equal to the app defaults are omitted so shared URLs stay short.

import {
  COMMUTE_STEPS,
  DEFAULT_MINUTES,
  DEFAULT_STATE,
  DEFAULT_WORK,
  METRICS,
  type MetricKey,
  type WorkLocation,
} from "../config";

export interface UrlState {
  state?: string;
  zip?: string;
  budget?: number;
  work?: WorkLocation;
  minutes?: number;
  metric?: MetricKey;
}

const METRIC_KEYS = new Set(METRICS.map((m) => m.key));

export function parseAppUrl(search: string): UrlState {
  const params = new URLSearchParams(search);
  const out: UrlState = {};

  const state = params.get("state")?.trim().toUpperCase();
  if (state && /^[A-Z]{2}$/.test(state)) out.state = state;

  const zip = params.get("zip")?.trim();
  if (zip && /^\d{5}$/.test(zip)) out.zip = zip;

  const budget = Number(params.get("budget"));
  if (Number.isFinite(budget) && budget > 0) out.budget = Math.round(budget);

  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (
    params.has("lat") &&
    params.has("lon") &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  ) {
    out.work = { lat, lon };
  }

  const minutes = Number(params.get("min"));
  if ((COMMUTE_STEPS as readonly number[]).includes(minutes)) out.minutes = minutes;

  const metric = params.get("metric");
  if (metric && METRIC_KEYS.has(metric as MetricKey)) out.metric = metric as MetricKey;

  return out;
}

export interface AppUrlInput {
  state: string;
  zip: string | null;
  budget: number;
  work: WorkLocation;
  minutes: number;
  metric: MetricKey;
}

/** Serialize to a query string ("?…" or "" when everything is default). */
export function serializeAppUrl(s: AppUrlInput): string {
  const params = new URLSearchParams();
  if (s.state !== DEFAULT_STATE) params.set("state", s.state);
  if (s.zip) params.set("zip", s.zip);
  if (s.budget > 0) params.set("budget", String(s.budget));
  if (s.work.lat !== DEFAULT_WORK.lat || s.work.lon !== DEFAULT_WORK.lon) {
    params.set("lat", s.work.lat.toFixed(4));
    params.set("lon", s.work.lon.toFixed(4));
  }
  if (s.minutes !== DEFAULT_MINUTES) params.set("min", String(s.minutes));
  if (s.metric !== METRICS[0].key) params.set("metric", s.metric);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
