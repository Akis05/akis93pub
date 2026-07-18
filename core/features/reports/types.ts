export type Period = "today" | "7d" | "30d" | "90d" | "365d" | "custom";
export type Dimension = "provider" | "country" | "campaign";

export interface ReportFilters {
  period: Period;
  from?: string; // ISO, used when period = custom
  to?: string;
  dimension?: Dimension;
}
