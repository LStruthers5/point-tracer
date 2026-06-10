export interface SessionPoint {
  lat: number;
  lon: number;
  x_m: number;
  y_m: number;
  t: string;
  speed_mps: number;
  speed_smooth_mps: number;
  heart_rate_bpm?: number;
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
  heart_rate_stats?: HeartRateStats;
  recovery_stats?: RecoveryStats;
}

export interface HeartRateStats {
  avg_bpm: number;
  min_bpm: number;
  max_bpm: number;
  start_bpm: number;
  end_bpm: number;
  sample_count: number;
}

export interface RecoveryStats {
  segment_id: number;
  next_segment_id: number;
  hr_end_bpm: number | null;
  hr_next_start_bpm: number | null;
  hr_drop_bpm: number | null;
  recovery_duration_s: number;
  recovery_rate_bpm_per_min: number | null;
}

export interface RecoverySummary {
  recovery_count: number;
  avg_hr_drop_bpm: number;
  avg_recovery_rate_bpm_per_min: number;
  fastest_recovery_segment_id: number;
  slowest_recovery_segment_id: number;
}

export interface SessionSummary {
  start_time: string;
  end_time: string;
  duration_min: number;
  trackpoint_count: number;
  distance_m: number;
  bbox: SegmentBbox;
  heart_rate_stats?: HeartRateStats | null;
  recovery_summary?: RecoverySummary;
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

export interface MultiplayerParticipantSummary {
  start_time: string;
  end_time: string;
  duration_s: number;
  time_offset_s: number;
  trackpoint_count: number;
  distance_m: number;
  bbox: SegmentBbox;
}

export interface MultiplayerParticipant {
  participant_id: string;
  label: string;
  source_file: string;
  sport: string;
  summary: MultiplayerParticipantSummary;
  points: SessionPoint[];
}

export interface MultiplayerSessionSummary {
  start_time: string;
  end_time: string;
  duration_s: number;
  duration_min: number;
  trackpoint_count: number;
  bbox: SegmentBbox;
  origin: {
    lat: number;
    lon: number;
  };
}

export interface MultiplayerPlaybackMetadata {
  clock: "shared_timestamp";
  start_time: string;
  end_time: string;
  duration_s: number;
  position_strategy: "interpolate_between_neighboring_points";
}

export interface MultiplayerSessionData {
  session_type: "multiplayer";
  sport: string;
  participant_count: number;
  summary: MultiplayerSessionSummary;
  playback: MultiplayerPlaybackMetadata;
  participants: MultiplayerParticipant[];
}
