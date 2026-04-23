import React, { useState, useRef, useEffect, Component } from "react";
import {
  View, Text, StyleSheet, Animated, Easing, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, TextInput, Modal, Pressable, PanResponder,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { BlurView } from "expo-blur";
import { CameraView, type CameraType, type FlashMode } from "expo-camera";
import { manipulateAsync, FlipType, SaveFormat } from "expo-image-manipulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { setCaptureData } from "../../lib/capture-store";
import { useUpload } from "../../lib/upload-context";
import StandardCamera from "../StandardCamera";
import DrawingCanvas, { type DrawingCanvasRef } from "../DrawingCanvas";
import { SendIcon, FeatherIcon, FlipIcon, CloseIcon, FlashIcon } from "./GroupIcons";

const NAVBAR_HEIGHT = 100;

type CameraMode = "PHOTO" | "VIDEO" | "AUDIO" | "DESSIN" | "TEXTE";

type SlotData = {
  mode: CameraMode;
  uri: string | null;
  audioUri: string | null;
  textContent: string;
  note: string;
};

type GroupInfo = { id: string; name: string };

type Props = {
  groupId: string;
  userId: string;
  isActive: boolean;
  allGroups: GroupInfo[];
  onScrollLock: (locked: boolean) => void;
  onCaptureSent?: () => void;
};

class CameraErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: "" }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error: error?.message ?? String(error) }; }
  componentDidCatch(error: any, info: any) { console.error("[CameraPage] Render error:", error, info?.componentStack); }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function CameraPageInner({ groupId, userId, isActive, allGroups, onScrollLock, onCaptureSent }: Props) {
  const insets = useSafeAreaInsets();
  const { startUpload } = useUpload();

  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const cameraRef = useRef<CameraView>(null);
  const drawingRef = useRef<DrawingCanvasRef>(null);
  const textInputRef = useRef<any>(null);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const startTouchY = useRef<number | null>(null);
  const audioTimer = useRef<NodeJS.Timeout | null>(null);
  const isAudioRecordingRef = useRef(false);
  const audioProgressAnim = useRef(new Animated.Value(0)).current;
  const isWarmingUp = useRef(false);
  const warmUpCancelled = useRef(false);
  const warmUpPromise = useRef<Promise<any> | null>(null);

  // Double-capture slots
  const [slot1, setSlot1] = useState<SlotData | null>(null);
  const [slot2, setSlot2] = useState<SlotData | null>(null);
  const [viewingSlot, setViewingSlot] = useState<1 | 2>(1);
  const [capturingSecond, setCapturingSecond] = useState(false);
  const capturingSecondRef = useRef(false);

  const [cameraMode, setCameraMode] = useState<CameraMode>("PHOTO");
  const [drawingColor, setDrawingColor] = useState("#000000");
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(6);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [zoom, setZoom] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [textModeContent, setTextModeContent] = useState("");
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);

  // Derived state
  const isCapturing = slot1 === null || capturingSecond;
  const recapturingFirst = slot1 === null && slot2 !== null && !capturingSecond;
  const previewSlot = isCapturing ? null : (viewingSlot === 1 ? slot1 : slot2);
  const capturedAudioUri = previewSlot?.audioUri ?? null;
  const hasSlot2 = slot2 !== null;
  const isSlot1Preview = slot1 !== null && !capturingSecond && viewingSlot === 1 && !hasSlot2;
  const isSlot1WithSlot2 = slot1 !== null && !capturingSecond && viewingSlot === 1 && hasSlot2;
  const isSlot2Preview = slot1 !== null && !capturingSecond && viewingSlot === 2;
  const showBottomSlotBar = isSlot1Preview || isSlot1WithSlot2 || isSlot2Preview;
  const videoPreviewPlayer = useVideoPlayer(previewSlot?.mode === "VIDEO" ? (previewSlot.uri ?? null) : null, p => { p.loop = true; p.play(); });

  const audioWaveAnims = useRef(
    [350, 500, 280, 420, 320, 480, 360].map((duration, i) => ({
      anim: new Animated.Value(0.15),
      duration,
      delay: i * 60,
    }))
  ).current;

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioPreviewPlayer = useAudioPlayer(capturedAudioUri || null);
  const audioPreviewStatus = useAudioPlayerStatus(audioPreviewPlayer);
  const audioPreviewSeekRef = useRef<any>(null);
  const audioPreviewSeekLayoutRef = useRef({ pageX: 0, width: 1 });
  const audioPreviewDurationRef = useRef(0);
  const audioPreviewPlayerRef = useRef(audioPreviewPlayer);

  useEffect(() => { audioPreviewDurationRef.current = audioPreviewStatus.duration ?? 0; }, [audioPreviewStatus.duration]);
  useEffect(() => { audioPreviewPlayerRef.current = audioPreviewPlayer; }, [audioPreviewPlayer]);

  const audioPreviewPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        const relX = evt.nativeEvent.pageX - audioPreviewSeekLayoutRef.current.pageX;
        const ratio = Math.max(0, Math.min(1, relX / audioPreviewSeekLayoutRef.current.width));
        audioPreviewPlayerRef.current.seekTo(ratio * audioPreviewDurationRef.current);
      },
      onPanResponderMove: (evt) => {
        const relX = evt.nativeEvent.pageX - audioPreviewSeekLayoutRef.current.pageX;
        const ratio = Math.max(0, Math.min(1, relX / audioPreviewSeekLayoutRef.current.width));
        audioPreviewPlayerRef.current.seekTo(ratio * audioPreviewDurationRef.current);
      },
    })
  ).current;

  useEffect(() => {
    const locked = slot1 !== null || isPinching || isDrawingActive;
    console.log(`[CAM] onScrollLock=${locked} | slot1=${!!slot1} isPinching=${isPinching} isDrawingActive=${isDrawingActive}`);
    onScrollLock(locked);
  }, [slot1, isPinching, isDrawingActive]);

  useEffect(() => {
    if (cameraMode === "AUDIO" && isCapturing && !capturedAudioUri) {
      AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
    } else {
      AudioModule.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  }, [cameraMode, isCapturing, capturedAudioUri]);

  useEffect(() => {
    if (cameraMode !== "VIDEO" || !isActive) return;
    warmUpCancelled.current = false;
    const doWarmUp = async () => {
      await new Promise(r => setTimeout(r, 300));
      if (warmUpCancelled.current || !cameraRef.current) return;
      isWarmingUp.current = true;
      try {
        const p = cameraRef.current.recordAsync({ maxDuration: 1 });
        warmUpPromise.current = p;
        await new Promise(r => setTimeout(r, 200));
        if (!warmUpCancelled.current) cameraRef.current.stopRecording();
        try { await p; } catch (_) {}
      } finally {
        warmUpPromise.current = null;
        isWarmingUp.current = false;
      }
    };
    doWarmUp();
    return () => { warmUpCancelled.current = true; };
  }, [cameraMode, isActive]);

  // ── Debug: log every render state ──
  useEffect(() => {
    console.log(`[CAM] render | slot1=${!!slot1} slot2=${!!slot2} capturingSecond=${capturingSecond} viewingSlot=${viewingSlot} isCapturing=${isCapturing} capturing=${capturing} isPinching=${isPinching} mode=${cameraMode} isActive=${isActive}`);
  });

  // ── Slot helpers ──

  const saveToSlot = (data: SlotData) => {
    console.log(`[CAM] saveToSlot | mode=${data.mode} isSecond=${capturingSecondRef.current}`);
    if (capturingSecondRef.current) {
      setSlot2(data);
      setCapturingSecond(false);
      capturingSecondRef.current = false;
      setViewingSlot(2);
    } else {
      setSlot1(data);
    }
  };

  const resetAll = () => {
    console.log("[CAM] resetAll");
    setSlot1(null);
    setSlot2(null);
    setViewingSlot(1);
    setCapturingSecond(false);
    capturingSecondRef.current = false;
    setTextModeContent("");
    setIsDrawingActive(false);
  };

  const handleTrash = () => {
    console.log(`[CAM] handleTrash | viewingSlot=${viewingSlot}`);
    if (viewingSlot === 2) {
      setSlot2(null);
      setViewingSlot(1);
    } else {
      setSlot1(null);
      setCapturingSecond(false);
      capturingSecondRef.current = false;
      setTextModeContent("");
      setIsDrawingActive(false);
    }
  };

  const updateSlot1Note = (val: string) => {
    setSlot1(prev => prev ? { ...prev, note: val } : prev);
  };

  // Auto-save texte vers slot2 pendant la capture secondaire
  useEffect(() => {
    if (!capturingSecond || cameraMode !== "TEXTE") return;
    if (textModeContent.trim()) {
      setSlot2({ mode: "TEXTE", uri: null, audioUri: null, textContent: textModeContent.trim(), note: "" });
    } else {
      setSlot2(null);
    }
  }, [textModeContent, capturingSecond, cameraMode]);

  // ── Handlers ──

  const handleTouchStart = (e: any) => { startTouchY.current = e.nativeEvent.pageY; };
  const handleTouchMove = (e: any) => {
    if (!isRecording || startTouchY.current === null) return;
    const diff = startTouchY.current - e.nativeEvent.pageY;
    setZoom(Math.min(Math.max(diff / 300, 0), 1));
  };

  const startVideoRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    if (cameraMode !== "VIDEO") setCameraMode("VIDEO");
    if (isWarmingUp.current) {
      warmUpCancelled.current = true;
      cameraRef.current.stopRecording();
      if (warmUpPromise.current) { try { await warmUpPromise.current; } catch (_) {} }
      isWarmingUp.current = false;
    }
    setIsRecording(true);
    setRecordingSeconds(0);
    recordingTimer.current = setInterval(() => {
      setRecordingSeconds(s => { if (s >= 14) { stopVideoRecording(); return s; } return s + 1; });
    }, 1000);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 15 });
      if (video?.uri) { saveToSlot({ mode: "VIDEO", uri: video.uri, audioUri: null, textContent: "", note: "" }); }
    } catch (e: any) { console.error("Erreur recordAsync:", e); }
    finally {
      setIsRecording(false);
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      setRecordingSeconds(0);
    }
  };

  const stopVideoRecording = () => { if (!isRecording) return; cameraRef.current?.stopRecording(); };

  const startAudioRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission refusée", "L'accès au micro est requis."); return; }
    try {
      try { await audioRecorder.stop(); } catch (_) {}
      await audioRecorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.record();
    } catch (e: any) {
      console.error("Erreur startAudioRecording:", e);
      Alert.alert("Erreur", `Impossible de démarrer l'enregistrement : ${e.message || e.toString()}`);
      return;
    }
    isAudioRecordingRef.current = true;
    setIsAudioRecording(true);
    setAudioSeconds(0);
    audioProgressAnim.setValue(0);
    Animated.timing(audioProgressAnim, { toValue: 1, duration: 30000, easing: Easing.linear, useNativeDriver: false }).start();
    audioTimer.current = setInterval(() => setAudioSeconds(s => s + 1), 1000);
    setTimeout(() => { if (isAudioRecordingRef.current) stopAudioRecordingDirect(); }, 30000);
    audioWaveAnims.forEach(({ anim, duration, delay }) => {
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.15, duration, useNativeDriver: true }),
      ])).start();
    });
  };

  const stopAudioRecordingDirect = async () => {
    if (!isAudioRecordingRef.current) return;
    isAudioRecordingRef.current = false;
    try { await audioRecorder.stop(); } catch (_) {}
    if (audioTimer.current) { clearInterval(audioTimer.current); audioTimer.current = null; }
    audioProgressAnim.stopAnimation();
    audioWaveAnims.forEach(({ anim }) => { anim.stopAnimation(); anim.setValue(0.15); });
    setIsAudioRecording(false);
    if (audioRecorder.uri) {
      saveToSlot({ mode: "AUDIO", uri: null, audioUri: audioRecorder.uri, textContent: "", note: "" });
    }
  };

  const stopAudioRecording = stopAudioRecordingDirect;

  const handleCapture = async () => {
    console.log(`[CAM] handleCapture | mode=${cameraMode} slot1=${!!slot1} slot2=${!!slot2} capturingSecond=${capturingSecond} capturing=${capturing} isPinching=${isPinching} cameraRef=${!!cameraRef.current}`);
    if (cameraMode === "TEXTE") {
      if (!textModeContent.trim()) return;
      saveToSlot({ mode: "TEXTE", uri: null, audioUri: null, textContent: textModeContent.trim(), note: "" });
      return;
    }
    if (cameraMode === "AUDIO") {
      if (isAudioRecording) await stopAudioRecording();
      else await startAudioRecording();
      return;
    }
    if (cameraMode === "DESSIN") {
      if (!isDrawingActive) { setIsDrawingActive(true); return; }
      if (!drawingRef.current) return;
      setCapturing(true);
      try {
        const uri = await drawingRef.current.capture();
        if (uri) saveToSlot({ mode: "DESSIN", uri, audioUri: null, textContent: "", note: "" });
      } finally { setCapturing(false); }
      return;
    }
    if (cameraMode === "VIDEO") {
      if (isRecording) stopVideoRecording(); else startVideoRecording();
      return;
    }
    if (!cameraRef.current) { console.warn("[CAM] handleCapture: cameraRef.current est null"); return; }
    if (isRecording) { console.warn("[CAM] handleCapture: bloqué car isRecording"); return; }
    if (capturing) { console.warn("[CAM] handleCapture: bloqué car déjà capturing"); return; }
    if (isPinching) { console.warn("[CAM] handleCapture: bloqué car isPinching"); return; }
    setCapturing(true);
    console.log("[CAM] takePictureAsync START");
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: Platform.OS === "android",
        exif: Platform.OS === "android",
      });
      console.log(`[CAM] takePictureAsync END | uri=${photo?.uri?.slice(0, 40)}`);
      if (photo?.uri) {
        const actions: any[] = [];
        if (Platform.OS === "android") {
          const exif = (photo.exif as any)?.Orientation ?? 1;
          const isFront = facing === "front";
          if (exif === 8) { if (!isFront) actions.push({ rotate: 180 }); }
          else if (exif === 6) { if (isFront) actions.push({ rotate: 180 }); }
          else if (exif === 3) actions.push({ rotate: isFront ? 90 : -90 });
          else if (exif === 1) actions.push({ rotate: isFront ? -90 : 90 });
        }
        if (facing === "front") actions.push({ flip: FlipType.Horizontal });
        let finalUri = photo.uri;
        if (actions.length > 0) {
          console.log(`[CAM] manipulateAsync START | actions=${JSON.stringify(actions)}`);
          const result = await manipulateAsync(photo.uri, actions, { compress: 0.92, format: SaveFormat.JPEG });
          finalUri = result.uri;
          console.log("[CAM] manipulateAsync END");
        }
        saveToSlot({ mode: "PHOTO", uri: finalUri, audioUri: null, textContent: "", note: "" });
      }
    } catch (e: any) {
      console.error("Capture error:", e);
      Alert.alert("Erreur", "Impossible de prendre la photo.");
    } finally { setCapturing(false); }
  };

  const openGroupPicker = () => {
    if (allGroups.length <= 1) { confirmUpload([groupId]); return; }
    setSelectedGroupIds([groupId]);
    setShowGroupPicker(true);
  };

  const toggleGroup = (id: string) => {
    setSelectedGroupIds(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const confirmUpload = (groupIds: string[]) => {
    if (!slot1) return;
    const ts = Date.now();
    groupIds.forEach((gId, i) => {
      // Primary file (slot1)
      let fileName: string | null = null;
      let fileUri: string | null = null;
      let contentType: string | null = null;
      let dbNote: string | null = null;

      if (slot1.mode === "TEXTE") {
        dbNote = slot1.textContent;
      } else if (slot1.mode === "AUDIO" && slot1.audioUri) {
        fileName = `${gId}/${userId}_${ts + i}.m4a`;
        fileUri = slot1.audioUri;
        contentType = "audio/m4a";
        dbNote = slot1.note.trim() || null;
      } else if (slot1.mode === "VIDEO" && slot1.uri) {
        fileName = `${gId}/${userId}_${ts + i}.mp4`;
        fileUri = slot1.uri;
        contentType = "video/mp4";
        dbNote = slot1.note.trim() || null;
      } else if ((slot1.mode === "PHOTO" || slot1.mode === "DESSIN") && slot1.uri) {
        const suffix = slot1.mode === "DESSIN" ? "_draw" : "";
        fileName = `${gId}/${userId}_${ts + i}${suffix}.jpg`;
        fileUri = slot1.uri;
        contentType = "image/jpeg";
        dbNote = slot1.note.trim() || null;
      }

      const dbData = { group_id: gId, user_id: userId, note: dbNote };

      // Secondary file (slot2)
      let secondFile = null;
      if (slot2) {
        if (slot2.mode === "TEXTE") {
          secondFile = { fileName: null, fileUri: null, contentType: null, note: slot2.textContent };
        } else if (slot2.mode === "AUDIO" && slot2.audioUri) {
          secondFile = { fileName: `${gId}/${userId}_${ts + i + 1000}.m4a`, fileUri: slot2.audioUri, contentType: "audio/m4a" };
        } else if (slot2.mode === "VIDEO" && slot2.uri) {
          secondFile = { fileName: `${gId}/${userId}_${ts + i + 1000}.mp4`, fileUri: slot2.uri, contentType: "video/mp4" };
        } else if ((slot2.mode === "PHOTO" || slot2.mode === "DESSIN") && slot2.uri) {
          const suffix2 = slot2.mode === "DESSIN" ? "_draw" : "";
          secondFile = { fileName: `${gId}/${userId}_${ts + i + 1000}${suffix2}.jpg`, fileUri: slot2.uri, contentType: "image/jpeg" };
        }
      }

      startUpload(fileName, fileUri, contentType, dbData, secondFile);
    });
    onCaptureSent?.();
    resetAll();
  };

  const handleConfirmGroupPicker = () => {
    if (selectedGroupIds.length === 0) return;
    setShowGroupPicker(false);
    confirmUpload(selectedGroupIds);
  };

  // ── Slot thumbnail renderer ──

  const renderSlotThumbnail = (slot: SlotData) => {
    if (slot.mode === "PHOTO" || slot.mode === "DESSIN") {
      return <Image source={{ uri: slot.uri ?? "" }} style={StyleSheet.absoluteFillObject as any} contentFit="cover" />;
    }
    if (slot.mode === "VIDEO" && slot.uri) {
      return <VideoSlotThumbnail uri={slot.uri} borderRadius={16} />;
    }
    if (slot.mode === "AUDIO") {
      return (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center" }]}>
          <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
          </Svg>
        </View>
      );
    }
    // TEXTE
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center", padding: 6 }]}>
        <Text style={{ color: "#FFF", fontSize: 9, fontFamily: "Inter_600SemiBold" }} numberOfLines={2}>{slot.textContent}</Text>
      </View>
    );
  };

  // ── Render ──

  return (
    <>
      {/* ── Camera / capture views ── */}
      {isCapturing && (
        cameraMode === "TEXTE" ? (
          <KeyboardAvoidingView
            style={[styles.textModeContainer, { paddingTop: Math.max(insets.top, 12) + 48 }]}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <Pressable style={{ flex: 1, width: "100%" }} onPress={() => textInputRef.current?.focus()}>
              <TextInput
                ref={textInputRef}
                style={[styles.textModeInput, { fontSize: textModeContent.length <= 120 ? 32 : textModeContent.length <= 260 ? 26 : textModeContent.length <= 450 ? 21 : textModeContent.length <= 650 ? 17 : 14 }]}
                placeholder="Écris..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                value={textModeContent}
                onChangeText={setTextModeContent}
                autofocus="off"
                textAlignVertical="top"
                pointerEvents="auto"
              />
            </Pressable>
          </KeyboardAvoidingView>
        ) : cameraMode === "DESSIN" ? (
          <View style={[styles.cameraPageContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: 24, paddingHorizontal: 12 }]}>
            <View style={styles.drawingArea}>
              {!isDrawingActive ? (
                <TouchableOpacity style={styles.drawingIdleOverlay} onPress={() => setIsDrawingActive(true)} activeOpacity={0.6}>
                  <Svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M12 20h9" /><Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </Svg>
                  <Text style={styles.drawingHintText}>Appuie pour commencer à dessiner</Text>
                </TouchableOpacity>
              ) : (
                <DrawingCanvas ref={drawingRef} color={drawingColor} strokeWidth={drawingStrokeWidth} onHistoryChange={(u, r) => { setCanUndo(u); setCanRedo(r); }} />
              )}
            </View>
          </View>
        ) : cameraMode === "AUDIO" ? (
          <View style={styles.audioModeContainer}>
            {isAudioRecording ? (
              <>
                <View style={[styles.audioProgressBar, { top: insets.top + 8 }]}>
                  <Animated.View style={[styles.audioProgressFill, { width: audioProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
                </View>
                <View style={styles.audioRecordingIndicator}>
                  <View style={styles.audioRedDot} />
                  <Text style={styles.audioTimerText}>{audioSeconds}s / 30s</Text>
                </View>
                <View style={styles.audioWaveformRow} pointerEvents="none">
                  {audioWaveAnims.map(({ anim }, i) => (
                    <Animated.View key={i} style={[styles.audioWaveformBar, { transform: [{ scaleY: anim }] }]} />
                  ))}
                </View>
              </>
            ) : (
              <TouchableOpacity style={styles.audioIdleTouchable} onPress={startAudioRecording} activeOpacity={0.7}>
                <Svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
                </Svg>
                <Text style={styles.audioHintText}>Appuie pour enregistrer</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[styles.cameraPageContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: (capturingSecond && slot1) ? NAVBAR_HEIGHT + 92 : NAVBAR_HEIGHT + 12, paddingHorizontal: 12 }]}>
            <View style={styles.cameraInner}>
              <StandardCamera
                ref={cameraRef}
                isActive={isCapturing}
                mode={Platform.OS === "ios" ? "video" : cameraMode === "VIDEO" ? "video" : "picture"}
                facing={facing}
                flash={flash}
                zoom={zoom}
                mirror={cameraMode === "VIDEO" && facing === "front"}
                onZoomChange={setZoom}
                onPinchingChange={setIsPinching}
                onDoubleTap={() => setFacing(prev => prev === "back" ? "front" : "back")}
              />
              <TouchableOpacity
                style={styles.flashBtn}
                onPress={() => setFlash(prev => prev === "off" ? "on" : prev === "on" ? "auto" : "off")}
              >
                <FlashIcon mode={flash} />
              </TouchableOpacity>
            </View>
          </View>
        )
      )}

      {/* ── Camera UI overlay ── */}
      {isCapturing && (
        <View style={styles.fill} pointerEvents="box-none">
          {cameraMode === "DESSIN" && isDrawingActive && (
            <TouchableOpacity
              pointerEvents="auto"
              style={[styles.drawingCancelBtn, { top: Math.max(insets.top, 12) + 28 }]}
              onPress={() => setIsDrawingActive(false)}
            >
              <CloseIcon />
            </TouchableOpacity>
          )}
          {isRecording && (
            <View style={[styles.recordingTimer, { top: Math.max(insets.top, 40) }]}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>{recordingSeconds}s / 15s</Text>
            </View>
          )}

          <View style={[styles.cameraFooter, { bottom: (cameraMode === "DESSIN" && isDrawingActive) ? insets.bottom + 16 : (capturingSecond && slot1 ? NAVBAR_HEIGHT + 104 : NAVBAR_HEIGHT + 24) }]}>
            {cameraMode === "DESSIN" && isDrawingActive ? (
              <View style={styles.drawingToolbar}>
                <TouchableOpacity style={[styles.drawingUndoBtn, !canUndo && styles.drawingUndoBtnDisabled]} onPress={() => drawingRef.current?.undo()} disabled={!canUndo}>
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={canUndo ? "#FFF" : "rgba(255,255,255,0.25)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M1 4v6h6" /><Path d="M3.51 15a9 9 0 1 0 .49-3.51L1 10" />
                  </Svg>
                </TouchableOpacity>
                <View style={styles.drawingColorGrid}>
                  {[
                    ["#000000","#FFFFFF","#FF3B30","#FF9F0A","#FFD60A"],
                    ["#30D158","#0A84FF","#BF5AF2","#FF2D92","#FF6B35"],
                    ["#5AC8FA","#34C759","#A2845E","#8E8E93","#1C1C1E"],
                  ].map((row, ri) => (
                    <View key={ri} style={styles.drawingColorRow}>
                      {row.map((c) => (
                        <TouchableOpacity key={c} onPress={() => setDrawingColor(c)} style={[styles.drawingColorDot, { backgroundColor: c }, drawingColor === c && styles.drawingColorDotActive]} />
                      ))}
                    </View>
                  ))}
                  <View style={styles.drawingBrushRow}>
                    {([3, 6, 12] as const).map((size) => (
                      <TouchableOpacity key={size} onPress={() => setDrawingStrokeWidth(size)} style={styles.drawingBrushBtn}>
                        <View style={[styles.drawingBrushDot, { width: size * 2.5, height: size * 2.5, borderRadius: size * 1.25, backgroundColor: drawingColor }, drawingStrokeWidth === size && styles.drawingBrushDotActive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TouchableOpacity style={[styles.drawingUndoBtn, !canRedo && styles.drawingUndoBtnDisabled]} onPress={() => drawingRef.current?.redo()} disabled={!canRedo}>
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={canRedo ? "#FFF" : "rgba(255,255,255,0.25)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M23 4v6h-6" /><Path d="M20.49 15a9 9 0 1 1-.49-3.51L23 10" />
                  </Svg>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ alignItems: "center", gap: 6 }}>
                <View style={styles.modeSlider}>
                  {(["PHOTO", "VIDEO", "AUDIO", "DESSIN", "TEXTE"] as CameraMode[]).map((m) => (
                    <TouchableOpacity key={m} onPress={() => { setCameraMode(m); if (m !== "DESSIN") setIsDrawingActive(false); }} disabled={isRecording || isAudioRecording}>
                      <Text style={[styles.modeText, cameraMode === m && styles.modeTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.captureRow}>
              {cameraMode !== "TEXTE" && <View style={styles.sideControlPlaceholder} />}
              {!(capturingSecond && cameraMode === "TEXTE") && <TouchableOpacity
                style={[styles.captureBtn, (cameraMode === "VIDEO" || isRecording) && styles.captureBtnVideo, isRecording && styles.captureBtnRecording, cameraMode === "AUDIO" && styles.captureBtnAudio, isAudioRecording && styles.captureBtnAudioRecording, (cameraMode === "TEXTE" && !!textModeContent.trim() || (cameraMode === "DESSIN" && isDrawingActive && canUndo)) && styles.captureBtnValid, (cameraMode === "TEXTE" && !textModeContent.trim() || (cameraMode === "DESSIN" && isDrawingActive && !canUndo)) && styles.captureBtnDimmed]}
                onPress={handleCapture}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                disabled={isPinching || (cameraMode === "TEXTE" && !textModeContent.trim()) || (cameraMode === "DESSIN" && isDrawingActive && !canUndo)}
                activeOpacity={0.8}
              >
                <View style={[styles.captureInner, (cameraMode === "VIDEO" || isRecording) && styles.captureInnerVideo, isRecording && styles.captureInnerRecording, cameraMode === "AUDIO" && styles.captureInnerAudio, isAudioRecording && styles.captureInnerAudioRecording, (cameraMode === "TEXTE" && !!textModeContent.trim() || (cameraMode === "DESSIN" && isDrawingActive && canUndo)) && styles.captureInnerValid, (cameraMode === "TEXTE" && !textModeContent.trim() || (cameraMode === "DESSIN" && isDrawingActive && !canUndo)) && styles.captureInnerDimmed]}>
                  {cameraMode === "TEXTE" && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={textModeContent.trim() ? "#FFF" : "rgba(255,255,255,0.3)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                  {cameraMode === "DESSIN" && !isDrawingActive && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M12 20h9" /><Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </Svg>
                  )}
                  {cameraMode === "DESSIN" && isDrawingActive && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                  {cameraMode === "AUDIO" && !isAudioRecording && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
                    </Svg>
                  )}
                  {isAudioRecording && <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: "#000" }} />}
                </View>
              </TouchableOpacity>}
              {cameraMode !== "TEXTE" && cameraMode !== "AUDIO" && cameraMode !== "DESSIN" && (
                <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(prev => prev === "back" ? "front" : "back")} disabled={isRecording}>
                  <FlipIcon />
                </TouchableOpacity>
              )}
              {(cameraMode === "AUDIO" || cameraMode === "DESSIN") && <View style={styles.sideControlPlaceholder} />}
            </View>
          </View>
          {/* ── Barre switch/envoyer pendant la 2e capture ── */}
          {capturingSecond && slot1 && !(cameraMode === "DESSIN" && isDrawingActive) && (
            <View style={[styles.capturingSecondBar, { bottom: NAVBAR_HEIGHT + 8 }]}>
              <TouchableOpacity
                style={styles.capturingSecondThumb}
                onPress={() => { setCapturingSecond(false); capturingSecondRef.current = false; setViewingSlot(1); }}
                activeOpacity={0.8}
              >
                {renderSlotThumbnail(slot1)}
                <View style={[slotBarStyles.badge, { top: 6, right: 6 }]}><Text style={slotBarStyles.badgeText}>1</Text></View>
                <View style={slotBarStyles.swapOverlay}>
                  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M7 16V4m0 0L3 8m4-4l4 4" /><Path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                  </Svg>
                </View>
              </TouchableOpacity>
              {cameraMode === "TEXTE" && slot2 && (
                <TouchableOpacity style={slotBarStyles.sendBtn} onPress={openGroupPicker}>
                  <SendIcon color="#000" />
                  <Text style={slotBarStyles.sendText}>Envoyer</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Preview: Photo / Drawing / Text ── */}
      {!isCapturing && isActive && previewSlot && previewSlot.mode !== "AUDIO" && (
        <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 8, paddingHorizontal: 12 }]}>
          {previewSlot.mode === "TEXTE" ? (
            <View style={[styles.previewImageWrapper, { backgroundColor: "#0A0A0A" }]}>
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
                <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", textAlign: "center", fontSize: previewSlot.textContent.length <= 120 ? 32 : previewSlot.textContent.length <= 260 ? 26 : previewSlot.textContent.length <= 450 ? 21 : 17 }}>
                  {previewSlot.textContent}
                </Text>
              </View>
              <View style={styles.previewTopBtns}>
                <TouchableOpacity style={styles.topSquareBtn} onPress={resetAll}><CloseIcon /></TouchableOpacity>
                {hasSlot2 && <TouchableOpacity style={styles.topSquareBtn} onPress={handleTrash}><TrashIcon /></TouchableOpacity>}
              </View>
              {viewingSlot === 1 && (
                <View style={[styles.previewContent, { bottom: 24 }]}>
                  {slot1!.note ? (
                    <Pressable style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)}>
                      <Text style={styles.previewNoteText}>{slot1!.note}</Text>
                    </Pressable>
                  ) : (
                    <TouchableOpacity style={styles.addNoteBtn} onPress={() => setIsEditingNote(true)}>
                      <FeatherIcon /><Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.previewImageWrapper, previewSlot.mode === "DESSIN" && { backgroundColor: "#000" }]}>
              {previewSlot.mode === "DESSIN" ? (
                <View style={styles.drawingPreviewCenter}>
                  <Image source={{ uri: previewSlot.uri ?? "" }} style={styles.drawingPreviewImage} contentFit="fill" />
                </View>
              ) : previewSlot.mode === "VIDEO" ? (
                <View style={[StyleSheet.absoluteFillObject, { overflow: "hidden" }]} pointerEvents="none">
                  <VideoView player={videoPreviewPlayer} style={StyleSheet.absoluteFillObject} contentFit="cover" nativeControls={false} />
                </View>
              ) : (
                <Image source={{ uri: previewSlot.uri ?? "" }} style={styles.previewImage} contentFit="cover" />
              )}
              <View style={styles.previewTopBtns}>
                <TouchableOpacity style={styles.topSquareBtn} onPress={resetAll}><CloseIcon /></TouchableOpacity>
                {hasSlot2 && <TouchableOpacity style={styles.topSquareBtn} onPress={handleTrash}><TrashIcon /></TouchableOpacity>}
              </View>
              {viewingSlot === 1 && (
                <View style={[styles.previewContent, { bottom: 24 }]}>
                  {slot1!.note ? (
                    <Pressable style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)}>
                      <Text style={styles.previewNoteText}>{slot1!.note}</Text>
                    </Pressable>
                  ) : (
                    <TouchableOpacity style={styles.addNoteBtn} onPress={() => setIsEditingNote(true)}>
                      <FeatherIcon /><Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
          {showBottomSlotBar && <SlotBar isSlot1Preview={isSlot1Preview} isSlot1WithSlot2={isSlot1WithSlot2} isSlot2Preview={isSlot2Preview} slot1={slot1} slot2={slot2} renderSlotThumbnail={renderSlotThumbnail} onAddSecond={() => { setTextModeContent(""); setIsDrawingActive(false); setCapturingSecond(true); capturingSecondRef.current = true; }} onSend={openGroupPicker} onViewSlot1={() => setViewingSlot(1)} onViewSlot2={() => setViewingSlot(2)} />}
          <Modal visible={isEditingNote} transparent animationType="fade">
            <BlurView intensity={100} tint="dark" style={styles.fill}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.noteEditorContainer}>
                <TextInput style={styles.largeNoteInput} placeholder="Note..." placeholderTextColor="rgba(255,255,255,0.3)" value={slot1?.note ?? ""} onChangeText={updateSlot1Note} maxLength={140} multiline autofocus="off" />
                <TouchableOpacity style={styles.doneNoteBtn} onPress={() => setIsEditingNote(false)}>
                  <Text style={styles.doneNoteText}>Terminé</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </BlurView>
          </Modal>
        </View>
      )}

      {/* ── Preview: Audio ── */}
      {!isCapturing && isActive && previewSlot?.mode === "AUDIO" && (
        <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 8, paddingHorizontal: 12 }]}>
          <View style={[styles.previewImageWrapper, { justifyContent: "center", alignItems: "center" }]}>
            <View style={[styles.fill, { backgroundColor: "#0A0A0A" }]} />
            <View style={styles.previewTopBtns}>
              <TouchableOpacity style={styles.topSquareBtn} onPress={resetAll}><CloseIcon /></TouchableOpacity>
              {hasSlot2 && <TouchableOpacity style={styles.topSquareBtn} onPress={handleTrash}><TrashIcon /></TouchableOpacity>}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }} pointerEvents="none">
              {[18,32,48,36,60,80,52,68,42,62,88,72,50,38,68,82,58,44,28,52].map((h, i) => (
                <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: "#FFF", opacity: audioPreviewStatus.currentTime > 0 && audioPreviewStatus.duration > 0 && (audioPreviewStatus.currentTime / audioPreviewStatus.duration) > i / 20 ? 0.9 : 0.25 }} />
              ))}
            </View>
            <View style={styles.audioPreviewPlayer}>
              <TouchableOpacity
                style={styles.audioPreviewPlayBtn}
                onPress={() => {
                  if (audioPreviewStatus.playing) { audioPreviewPlayer.pause(); }
                  else {
                    if (audioPreviewDurationRef.current > 0 && (audioPreviewStatus.currentTime ?? 0) >= audioPreviewDurationRef.current - 0.1) { audioPreviewPlayer.seekTo(0); }
                    audioPreviewPlayer.play();
                  }
                }}
              >
                <Svg width="28" height="28" viewBox="0 0 24 24" fill="#FFF">
                  {audioPreviewStatus.playing ? <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <Path d="M8 5v14l11-7z" />}
                </Svg>
              </TouchableOpacity>
              <View style={{ flex: 1, gap: 4 }}>
                <View
                  ref={audioPreviewSeekRef}
                  style={styles.audioPreviewSeekHitArea}
                  onLayout={() => { audioPreviewSeekRef.current?.measure((_x: number, _y: number, width: number, _h: number, pageX: number) => { audioPreviewSeekLayoutRef.current = { pageX, width }; }); }}
                  {...audioPreviewPan.panHandlers}
                >
                  <View style={styles.audioPreviewTrack}>
                    <View style={[styles.audioPreviewFill, { width: `${audioPreviewStatus.duration > 0 ? (audioPreviewStatus.currentTime / audioPreviewStatus.duration) * 100 : 0}%` as any }]} />
                  </View>
                  {audioPreviewStatus.currentTime > 0 && (
                    <View style={[styles.audioPreviewThumb, { left: `${Math.min(audioPreviewStatus.duration > 0 ? (audioPreviewStatus.currentTime / audioPreviewStatus.duration) * 100 : 0, 100)}%` as any }]} pointerEvents="none" />
                  )}
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.audioPreviewTime}>{Math.floor((audioPreviewStatus.currentTime ?? 0) / 60)}:{(Math.floor(audioPreviewStatus.currentTime ?? 0) % 60).toString().padStart(2, "0")}</Text>
                  <Text style={styles.audioPreviewTime}>{Math.floor((audioPreviewStatus.duration ?? 0) / 60)}:{(Math.floor(audioPreviewStatus.duration ?? 0) % 60).toString().padStart(2, "0")}</Text>
                </View>
              </View>
            </View>
            {viewingSlot === 1 && (
              <View style={[styles.previewContent, { bottom: 24 }]}>
                {slot1!.note ? (
                  <Pressable style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)}>
                    <Text style={styles.previewNoteText}>{slot1!.note}</Text>
                  </Pressable>
                ) : (
                  <TouchableOpacity style={styles.addNoteBtn} onPress={() => setIsEditingNote(true)}>
                    <FeatherIcon /><Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          {showBottomSlotBar && <SlotBar isSlot1Preview={isSlot1Preview} isSlot1WithSlot2={isSlot1WithSlot2} isSlot2Preview={isSlot2Preview} slot1={slot1} slot2={slot2} renderSlotThumbnail={renderSlotThumbnail} onAddSecond={() => { setTextModeContent(""); setIsDrawingActive(false); setCapturingSecond(true); capturingSecondRef.current = true; }} onSend={openGroupPicker} onViewSlot1={() => setViewingSlot(1)} onViewSlot2={() => setViewingSlot(2)} />}
          <Modal visible={isEditingNote} transparent animationType="fade">
            <BlurView intensity={100} tint="dark" style={styles.fill}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.noteEditorContainer}>
                <TextInput style={styles.largeNoteInput} placeholder="Note..." placeholderTextColor="rgba(255,255,255,0.3)" value={slot1?.note ?? ""} onChangeText={updateSlot1Note} maxLength={140} multiline autofocus="off" />
                <TouchableOpacity style={styles.doneNoteBtn} onPress={() => setIsEditingNote(false)}>
                  <Text style={styles.doneNoteText}>Terminé</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </BlurView>
          </Modal>
        </View>
      )}

      {/* ── Group Picker ── */}
      <Modal visible={showGroupPicker} transparent animationType="fade" onRequestClose={() => setShowGroupPicker(false)}>
        <Pressable style={pickerStyles.overlay} onPress={() => setShowGroupPicker(false)}>
          <Pressable style={pickerStyles.card} onPress={() => {}}>
            <Text style={pickerStyles.title}>Envoyer dans...</Text>
            {allGroups.map((g) => {
              const selected = selectedGroupIds.includes(g.id);
              return (
                <TouchableOpacity key={g.id} style={pickerStyles.row} onPress={() => toggleGroup(g.id)} activeOpacity={0.7}>
                  <View style={[pickerStyles.checkbox, selected && pickerStyles.checkboxOn]}>
                    {selected && (
                      <Svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                        <Path d="M20 6L9 17L4 12" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </View>
                  <Text style={pickerStyles.groupName}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[pickerStyles.sendBtn, selectedGroupIds.length === 0 && { opacity: 0.35 }]} onPress={handleConfirmGroupPicker} disabled={selectedGroupIds.length === 0}>
              <Text style={pickerStyles.sendBtnText}>Envoyer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowGroupPicker(false)} style={pickerStyles.cancelWrap}>
              <Text style={pickerStyles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function VideoSlotThumbnail({ uri, borderRadius = 0 }: { uri: string; borderRadius?: number }) {
  const player = useVideoPlayer(uri, p => { p.pause(); });
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <VideoView player={player} style={{ flex: 1, borderRadius }} contentFit="cover" nativeControls={false} />
    </View>
  );
}

type SlotBarProps = {
  isSlot1Preview: boolean;
  isSlot1WithSlot2: boolean;
  isSlot2Preview: boolean;
  slot1: SlotData | null;
  slot2: SlotData | null;
  renderSlotThumbnail: (slot: SlotData) => React.ReactNode;
  onAddSecond: () => void;
  onSend: () => void;
  onViewSlot1: () => void;
  onViewSlot2: () => void;
};

function SlotBar({ isSlot1Preview, isSlot1WithSlot2, isSlot2Preview, slot1, slot2, renderSlotThumbnail, onAddSecond, onSend, onViewSlot1, onViewSlot2 }: SlotBarProps) {
  return (
    <View style={slotBarStyles.bar}>
      {isSlot1Preview && (
        <>
          <TouchableOpacity style={slotBarStyles.addBtn} onPress={onAddSecond}>
            <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <Path d="M12 5V19" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M5 12H19" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
            <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <Path d="M20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22H20C21.1046 22 20 21.1046 22 20V11C22 9.89543 21.1046 9 20 9Z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={slotBarStyles.sendBtn} onPress={onSend}>
            <SendIcon color="#000" />
            <Text style={slotBarStyles.sendText}>Envoyer</Text>
          </TouchableOpacity>
        </>
      )}
      {isSlot1WithSlot2 && (
        <>
          <TouchableOpacity style={slotBarStyles.thumbBtn} onPress={onViewSlot2}>
            {renderSlotThumbnail(slot2!)}
            <View style={slotBarStyles.badge}><Text style={slotBarStyles.badgeText}>2</Text></View>
          </TouchableOpacity>
          <TouchableOpacity style={slotBarStyles.sendBtn} onPress={onSend}>
            <SendIcon color="#000" />
            <Text style={slotBarStyles.sendText}>Envoyer</Text>
          </TouchableOpacity>
        </>
      )}
      {isSlot2Preview && (
        <>
          <TouchableOpacity style={slotBarStyles.thumbBtn} onPress={onViewSlot1}>
            {renderSlotThumbnail(slot1!)}
            <View style={[slotBarStyles.badge, { right: 8 }]}><Text style={slotBarStyles.badgeText}>1</Text></View>
            <View style={slotBarStyles.swapOverlay}>
              <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M7 16V4m0 0L3 8m4-4l4 4" /><Path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
              </Svg>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={slotBarStyles.sendBtn} onPress={onSend}>
            <SendIcon color="#000" />
            <Text style={slotBarStyles.sendText}>Envoyer</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const slotBarStyles = StyleSheet.create({
  bar: { height: 72, flexDirection: "row", gap: 12, marginTop: 8 },
  addBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FFF", borderRadius: 16 },
  sendBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#FFF", borderRadius: 16 },
  sendText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 16 },
  thumbBtn: { flex: 1, borderRadius: 16, overflow: "hidden" },
  badge: { position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  badgeText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 10 },
  swapOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center" },
});

function TrashIcon() {
  return (
    <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h18" /><Path d="M19 6l-1 14H6L5 6" /><Path d="M8 6V4h8v2" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  cameraPageContainer: { flex: 1, backgroundColor: "#000", alignItems: "center" },
  cameraInner: { flex: 1, width: "100%" },
  flashBtn: { position: "absolute", top: 16, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  textModeContainer: { flex: 1, justifyContent: "flex-start", backgroundColor: "#0A0A0A", paddingHorizontal: 32 },
  textModeInput: { color: "#FFF", fontFamily: "Inter_700Bold", textAlign: "center", width: "100%", paddingTop: 0 },
  audioModeContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 20, backgroundColor: "#0A0A0A" },
  audioProgressBar: { position: "absolute", left: 16, right: 16, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  audioProgressFill: { height: "100%", borderRadius: 2, backgroundColor: "#A78BFA" },
  audioRecordingIndicator: { flexDirection: "row", alignItems: "center", gap: 12 },
  audioRedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" },
  audioTimerText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 38, letterSpacing: 2, width: 260, textAlign: "center" },
  audioHintText: { color: "rgba(255,255,255,0.3)", fontFamily: "Inter_400Regular", fontSize: 13, letterSpacing: 0.5, marginTop: 4 },
  audioWaveformRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 52 },
  audioWaveformBar: { width: 3.5, height: 44, borderRadius: 2, backgroundColor: "#FFF" },
  cameraFooter: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 24 },
  modeSlider: { flexDirection: "row", gap: 4, backgroundColor: "rgba(0,0,0,0.3)", paddingHorizontal: 20, paddingVertical: 4, borderRadius: 20, marginBottom: 12 },
  modeText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_700Bold", fontSize: 12, paddingVertical: 10, paddingHorizontal: 8 },
  modeTextActive: { color: "#FFF" },
  drawingArea: { width: "100%", aspectRatio: 3 / 4, borderRadius: 32, overflow: "hidden", backgroundColor: "#FFF" },
  drawingIdleOverlay: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  drawingHintText: { color: "rgba(0,0,0,0.25)", fontFamily: "Inter_400Regular", fontSize: 13, letterSpacing: 0.5 },
  drawingToolbar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, marginBottom: 12 },
  drawingColorGrid: { flexDirection: "column", gap: 6 },
  drawingColorRow: { flexDirection: "row", gap: 6 },
  drawingColorDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)" },
  drawingColorDotActive: { transform: [{ scale: 1.35 }], borderColor: "#FFF", shadowColor: "#FFF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5, elevation: 6 },
  drawingBrushRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 4 },
  drawingBrushBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  drawingBrushDot: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)", opacity: 0.7 },
  drawingBrushDotActive: { opacity: 1, borderColor: "#FFF", shadowColor: "#FFF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4, elevation: 5 },
  drawingUndoBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  drawingUndoBtnDisabled: { backgroundColor: "rgba(255,255,255,0.06)" },
  drawingCancelBtn: { position: "absolute", left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  audioIdleTouchable: { flex: 1, justifyContent: "center", alignItems: "center", gap: 20 },
  captureRow: { flexDirection: "row", alignItems: "center", gap: 32 },
  sideControlPlaceholder: { width: 48 },
  flipBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  captureBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFF", justifyContent: "center", alignItems: "center" },
  captureBtnVideo: { borderColor: "rgba(255,59,48,0.5)" },
  captureBtnRecording: { borderColor: "#FF3B30" },
  captureBtnAudio: { borderColor: "rgba(255,255,255,0.4)" },
  captureBtnAudioRecording: { borderColor: "#FFF" },
  captureBtnValid: { borderColor: "#34C759" },
  captureInnerValid: { backgroundColor: "#34C759" },
  captureBtnDimmed: { borderColor: "rgba(255,255,255,0.2)" },
  captureInnerDimmed: { backgroundColor: "rgba(255,255,255,0.15)" },
  captureInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  captureInnerVideo: { backgroundColor: "#FF3B30" },
  captureInnerRecording: { width: 30, height: 30, borderRadius: 6 },
  captureInnerAudio: { backgroundColor: "#FFF" },
  captureInnerAudioRecording: { backgroundColor: "#FFF", width: 28, height: 28, borderRadius: 6 },
  recordingTimer: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" },
  recordingText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  // Preview
  previewContainer: { flex: 1, backgroundColor: "#000", alignItems: "center" },
  previewImageWrapper: { flex: 1, width: "100%", borderRadius: 32, overflow: "hidden", backgroundColor: "#1A1A1A" },
  previewImage: { width: "100%", height: "100%" },
  drawingPreviewCenter: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-start", alignItems: "center" },
  drawingPreviewImage: { width: "100%", aspectRatio: 3 / 4, borderRadius: 28, overflow: "hidden", backgroundColor: "#FFF" },
  previewTopBtns: { position: "absolute", top: 16, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  topSquareBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  previewContent: { position: "absolute", left: 24, right: 24 },
  previewNoteBox: { backgroundColor: "rgba(0,0,0,0.5)", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  previewNoteText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  addNoteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.4)", borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  addNoteBtnText: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  noteEditorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  largeNoteInput: { width: "100%", color: "#FFF", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 40 },
  doneNoteBtn: { backgroundColor: "#FFF", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 100 },
  doneNoteText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 16 },
  // Audio preview
  audioPreviewPlayer: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 32, paddingHorizontal: 24, width: "100%" },
  audioPreviewPlayBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  audioPreviewSeekHitArea: { paddingVertical: 14, justifyContent: "center" },
  audioPreviewTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 2 },
  audioPreviewFill: { height: 3, backgroundColor: "#FFF", borderRadius: 2 },
  audioPreviewThumb: { position: "absolute", width: 13, height: 13, borderRadius: 7, backgroundColor: "#FFF", marginLeft: -6, top: 14 - 5 },
  audioPreviewTime: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" },
  // Barre full-width de switch/envoi pendant la 2e capture
  capturingSecondBar: { position: "absolute", left: 12, right: 12, height: 72, flexDirection: "row", gap: 12 },
  capturingSecondThumb: { flex: 1, borderRadius: 16, overflow: "hidden" },
});

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", alignItems: "center", padding: 28 },
  card: { backgroundColor: "#1C1C1E", borderRadius: 20, padding: 24, width: "100%" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", justifyContent: "center", alignItems: "center" },
  checkboxOn: { backgroundColor: "#FFF", borderColor: "#FFF" },
  groupName: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 16, flex: 1 },
  sendBtn: { backgroundColor: "#FFF", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 20, marginBottom: 8 },
  sendBtnText: { color: "#000", fontSize: 16, fontFamily: "Inter_700Bold" },
  cancelWrap: { alignItems: "center", paddingVertical: 8 },
  cancelText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});

export default function CameraPage(props: Props) {
  return (
    <CameraErrorBoundary>
      <CameraPageInner {...props} />
    </CameraErrorBoundary>
  );
}
