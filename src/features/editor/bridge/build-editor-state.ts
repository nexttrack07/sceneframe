import type { Shot } from "@/db/schema";
import type {
  SceneAssetSummary,
  TransitionVideoSummary,
  VoiceoverAssetSummary,
} from "@/features/projects/project-types";
import type { EditorStarterAsset } from "../vendor/assets/assets";
import type { EditorStarterItem } from "../vendor/items/item-type";
import type { TrackType, UndoableState } from "../vendor/state/types";
import {
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
  DEFAULT_FPS,
} from "../vendor/constants";

function genId(prefix: string, id: string): string {
  return `${prefix}-${id}`;
}

export function buildEditorState({
  shots,
  assets,
  transitionVideos,
  voiceovers,
}: {
  shots: Shot[];
  assets: SceneAssetSummary[];
  transitionVideos: TransitionVideoSummary[];
  voiceovers: VoiceoverAssetSummary[];
}): UndoableState {
  const itemsMap: Record<string, EditorStarterItem> = {};
  const assetsMap: Record<string, EditorStarterAsset> = {};

  // --- Video track: transition videos placed sequentially ---
  const videoItemIds: string[] = [];
  let startFrame = 0;

  const selectedTransitions = transitionVideos.filter(
    (tv) => tv.isSelected && tv.status === "done" && tv.url != null,
  );

  // Build a lookup: "fromShotId->toShotId" => TransitionVideoSummary
  const transitionByPair = new Map<string, TransitionVideoSummary>();
  for (const tv of selectedTransitions) {
    transitionByPair.set(`${tv.fromShotId}->${tv.toShotId}`, tv);
  }

  // Walk consecutive shot pairs in order to place transitions
  for (let i = 0; i < shots.length - 1; i++) {
    const fromShot = shots[i];
    const toShot = shots[i + 1];
    const tv = transitionByPair.get(`${fromShot.id}->${toShot.id}`);
    if (!tv || !tv.url) continue;

    const durationInSeconds = 5000 / 1000; // TransitionVideoSummary carries no durationMs; use 5s default
    const durationInFrames = Math.round(durationInSeconds * DEFAULT_FPS);

    const assetId = genId("asset-tv", tv.id);
    const itemId = genId("item-tv", tv.id);

    assetsMap[assetId] = {
      type: "video",
      id: assetId,
      remoteUrl: tv.url,
      durationInSeconds,
      hasAudioTrack: false,
      width: DEFAULT_COMPOSITION_WIDTH,
      height: DEFAULT_COMPOSITION_HEIGHT,
      filename: "transition.mp4",
      size: 0,
      remoteFileKey: null,
      mimeType: "video/mp4",
    };

    itemsMap[itemId] = {
      type: "video",
      id: itemId,
      assetId,
      from: startFrame,
      durationInFrames,
      top: 0,
      left: 0,
      width: DEFAULT_COMPOSITION_WIDTH,
      height: DEFAULT_COMPOSITION_HEIGHT,
      opacity: 1,
      isDraggingInTimeline: false,
      videoStartFromInSeconds: 0,
      decibelAdjustment: 0,
      playbackRate: 1,
      audioFadeInDurationInSeconds: 0,
      audioFadeOutDurationInSeconds: 0,
      fadeInDurationInSeconds: 0,
      fadeOutDurationInSeconds: 0,
      keepAspectRatio: true,
      borderRadius: 0,
      rotation: 0,
      cropLeft: 0,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
    };

    videoItemIds.push(itemId);
    startFrame += durationInFrames;
  }

  // --- Image assets: add to asset panel only (no timeline items) ---
  for (const shot of shots) {
    const selectedImage = assets.find(
      (a) =>
        a.shotId === shot.id &&
        a.isSelected &&
        a.status === "done" &&
        a.url != null,
    );
    if (!selectedImage || !selectedImage.url) continue;

    const assetId = genId("asset-img", selectedImage.id);
    assetsMap[assetId] = {
      type: "image",
      id: assetId,
      remoteUrl: selectedImage.url,
      width: DEFAULT_COMPOSITION_WIDTH,
      height: DEFAULT_COMPOSITION_HEIGHT,
      filename: "shot.jpg",
      size: 0,
      remoteFileKey: null,
      mimeType: "image/jpeg",
    };
  }

  // --- Audio track: selected voiceovers placed at frame 0 ---
  const audioItemIds: string[] = [];

  const selectedVoiceovers = voiceovers.filter(
    (vo) => vo.isSelected && vo.status === "done" && vo.url != null,
  );

  for (const vo of selectedVoiceovers) {
    if (!vo.url) continue;

    const durationInSeconds = (vo.durationMs ?? 5000) / 1000;
    const durationInFrames = Math.round(durationInSeconds * DEFAULT_FPS);

    const assetId = genId("asset-vo", vo.id);
    const itemId = genId("item-vo", vo.id);

    assetsMap[assetId] = {
      type: "audio",
      id: assetId,
      remoteUrl: vo.url,
      durationInSeconds,
      filename: "voiceover.mp3",
      size: 0,
      remoteFileKey: null,
      mimeType: "audio/mpeg",
    };

    itemsMap[itemId] = {
      type: "audio",
      id: itemId,
      assetId,
      from: 0,
      durationInFrames,
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      opacity: 1,
      isDraggingInTimeline: false,
      audioStartFromInSeconds: 0,
      decibelAdjustment: 0,
      playbackRate: 1,
      audioFadeInDurationInSeconds: 0,
      audioFadeOutDurationInSeconds: 0,
    };

    audioItemIds.push(itemId);
  }

  // --- Assemble tracks ---
  const videoTrack: TrackType = {
    id: "track-video",
    items: videoItemIds,
    hidden: false,
    muted: false,
  };

  const audioTrack: TrackType = {
    id: "track-audio",
    items: audioItemIds,
    hidden: false,
    muted: false,
  };

  const tracks = [videoTrack];
  if (audioItemIds.length > 0) tracks.push(audioTrack);

  return {
    tracks,
    items: itemsMap,
    assets: assetsMap,
    fps: DEFAULT_FPS,
    compositionWidth: DEFAULT_COMPOSITION_WIDTH,
    compositionHeight: DEFAULT_COMPOSITION_HEIGHT,
    deletedAssets: [],
  };
}
