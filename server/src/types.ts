export interface CaptionTrack {
  id: string;
  language: string;
  name: string;
  isAutoSynced: boolean;
}

export interface VideoMeta {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
  duration: string;
  videoUrl: string;
}

export interface VideoInfoResponse {
  meta: VideoMeta;
  captions: CaptionTrack[];
  resolutions: number[];
}

export interface DecodedCaptionToken {
  isAuto: boolean;
  lang: string;
  directUrl?: string;
}
