export interface SessionPoint {
  lat: number;
  lon: number;
  x_m: number;
  y_m: number;
  t: string;
  speed_mps: number;
  speed_smooth_mps: number;
}

export interface SegmentBbox {
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
}

export interface SessionSegment {
  segment_id: number;
  label: string;
  start_idx: number;
  end_idx: number;
  start_time: string;
  end_time: string;
  duration_s: number;
  distance_m: number;
  mean_speed_mps: number;
  point_count: number;
  bbox: SegmentBbox;
}

export interface SessionSummary {
  start_time: string;
  end_time: string;
  duration_min: number;
  trackpoint_count: number;
  distance_m: number;
  bbox: SegmentBbox;
}

export interface SessionData {
  activity_name: string;
  source_file: string;
  sport: string;
  summary: SessionSummary;
  segmentation_method: {
    type: string;
    notes: string;
  };
  segments: SessionSegment[];
  points: SessionPoint[];
}
