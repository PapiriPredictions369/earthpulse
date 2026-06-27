export type Severity = "low" | "moderate" | "high" | "extreme";

export type SignalCategory =
  | "earthquake"
  | "wildfire"
  | "volcano"
  | "severe-storm"
  | "flood"
  | "drought"
  | "sea-ice"
  | "landslide"
  | "snow"
  | "dust-haze"
  | "temperature"
  | "water-color"
  | "manmade"
  | "solar-flare"
  | "cme"
  | "other";

/** A normalized "something is happening" event from any source. */
export type Signal = {
  id: string;
  category: SignalCategory;
  title: string;
  /** Free-form scale, e.g. "M5.4" or "X1.2" or "Kp 7". */
  scale?: string;
  /** Numeric magnitude when meaningful (used for sizing/sorting). */
  magnitude?: number;
  severity: Severity;
  time: string; // ISO 8601
  lat?: number;
  lng?: number;
  url?: string;
  source: string;
};

export type Gauge = {
  label: string;
  value: number | null;
  unit?: string;
  /** Optional human label for the value, e.g. flare class "M1.2". */
  display?: string;
  severity: Severity;
  time?: string;
  source: string;
};

export type SchumannReading = {
  /** Fundamental frequency in Hz (≈7.83 baseline). */
  frequency: number | null;
  /** Amplitude / power, arbitrary units, when available. */
  amplitude: number | null;
  severity: Severity;
  status: string;
  note?: string;
  time?: string;
  source: string;
};

export type Feed = {
  updatedAt: string;
  cache: string;
  events: Signal[];
  gauges: Gauge[];
  schumann: SchumannReading;
  errors: string[];
};
