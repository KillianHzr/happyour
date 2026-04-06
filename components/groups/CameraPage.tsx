import { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, Dimensions, Animated, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, TextInput, Modal, Pressable, ActivityIndicator, PanResponder,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { CameraView, type CameraType, type FlashMode } from "expo-camera";
import { manipulateAsync, SaveFormat, FlipType } from "expo-image-manipulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { setCaptureData } from "../../lib/capture-store";
import { useUpload } from "../../lib/upload-context";
import StandardCamera from "../StandardCamera";
import DrawingCanvas, { type DrawingCanvasRef } from "../DrawingCanvas";
import { SendIcon, FeatherIcon, FlipIcon, CloseIcon, FlashIcon } from "./GroupIcons";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NAVBAR_HEIGHT = 100;

type CameraMode = "PHOTO" | "VIDEO" | "AUDIO" | "DESSIN" | "TEXTE";

type Props = {
  groupId: string;
  userId: string;
  onUploadSuccess: () => void;
  onScrollLock: (locked: boolean) => void;
};

export default function CameraPage({ groupId, userId, onUploadSuccess, onScrollLock }: Props) {
  const insets = useSafeAreaInsets();
  const { startUpload } = useUpload();

  const cameraRef = useRef<CameraView>(null);
  const drawingRef = useRef<DrawingCanvasRef>(null);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const startTouchY = useRef<number | null>(null);
  const audioTimer = useRef<NodeJS.Timeout | null>(null);

  const [cameraMode, setCameraMode] = useState<CameraMode>("PHOTO");
  const [drawingColor, setDrawingColor] = useState("#FFFFFF");
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [zoom, setZoom] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedFacing, setCapturedFacing] = useState<CameraType>("back");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [textModeContent, setTextModeContent] = useState("");
  const [note, setNote] = useState("");
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);
  const [capturedAudioUri, setCapturedAudioUri] = useState<string | null>(null);

  const audioWaveAnims = useRef(
    [350, 500, 280, 420, 320, 480, 360].map((duration, i) => ({
      anim: new Animated.Value(0.15),
      duration,
      delay: i * 60,
    }))
  ).current;

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioPreviewPlayer = useAudioPlayer(capturedAudioUri ?? "");
  const audioPreviewStatus = useAudioPlayerStatus(audioPreviewPlayer);
  const audioPreviewSeekRef = useRef<View>(null);
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

  // Inform parent about scroll lock state
  useEffect(() => {
    onScrollLock(!!capturedUri || !!capturedAudioUri || isPinching);
  }, [capturedUri, capturedAudioUri, isPinching]);

  const isEditing = !!capturedUri || !!capturedAudioUri;

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
    setIsRecording(true);
    setRecordingSeconds(0);
    recordingTimer.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const video = await cameraRef.current.recordAsync({ quality: "1080p", maxDuration: 15 });
      if (video?.uri) {
        setCaptureData(null, video.uri, "video");
        router.push(`/(app)/groups/${groupId}/preview`);
      }
    } catch (e: any) {
      console.error("Erreur recordAsync:", e);
    } finally {
      setIsRecording(false);
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      setRecordingSeconds(0);
    }
  };

  const stopVideoRecording = () => { if (!isRecording) return; cameraRef.current?.stopRecording(); };

  const startAudioRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission refusée", "L'accès au micro est requis."); return; }
    await audioRecorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
    audioRecorder.record();
    setIsAudioRecording(true);
    setAudioSeconds(0);
    audioTimer.current = setInterval(() => setAudioSeconds(s => s + 1), 1000);
    audioWaveAnims.forEach(({ anim, duration, delay }) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.15, duration, useNativeDriver: true }),
        ])
      ).start();
    });
  };

  const stopAudioRecording = async () => {
    if (!isAudioRecording) return;
    await audioRecorder.stop();
    if (audioTimer.current) clearInterval(audioTimer.current);
    audioWaveAnims.forEach(({ anim }) => { anim.stopAnimation(); anim.setValue(0.15); });
    setIsAudioRecording(false);
    if (audioRecorder.uri) setCapturedAudioUri(audioRecorder.uri);
  };

  const handleCapture = async () => {
    if (cameraMode === "TEXTE") {
      if (!textModeContent.trim()) return;
      handleUploadText();
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
        if (uri) setCapturedUri(uri);
      } finally {
        setCapturing(false);
      }
      return;
    }
    if (cameraMode === "VIDEO") {
      if (isRecording) stopVideoRecording();
      else startVideoRecording();
      return;
    }
    if (!cameraRef.current || isRecording || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        const paddingTop = Math.max(insets.top, 12) + 12;
        const paddingBottom = NAVBAR_HEIGHT + 12;
        const uiWidth = SCREEN_WIDTH - 24;
        const uiHeight = SCREEN_HEIGHT - paddingTop - paddingBottom;
        const targetRatio = uiWidth / uiHeight;
        const sensorRatio = photo.width / photo.height;
        let actions: any[] = [];
        if (sensorRatio > targetRatio) {
          const cropWidth = photo.height * targetRatio;
          actions.push({ crop: { originX: (photo.width - cropWidth) / 2, originY: 0, width: cropWidth, height: photo.height } });
        } else {
          const cropHeight = photo.width / targetRatio;
          actions.push({ crop: { originX: 0, originY: (photo.height - cropHeight) / 2, width: photo.width, height: cropHeight } });
        }
        if (facing === "front") actions.push({ flip: FlipType.Horizontal });
        actions.push({ resize: { width: 1080 } });
        const manipResult = await manipulateAsync(photo.uri, actions, { compress: 0.92, format: SaveFormat.JPEG, base64: false });
        setCapturedUri(manipResult.uri);
        setCapturedFacing(facing);
      }
    } catch (e: any) {
      console.error("Capture error:", e);
      Alert.alert("Erreur", "Impossible de prendre la photo.");
    } finally {
      setCapturing(false);
    }
  };

  const handleUploadPhoto = () => {
    if (!capturedUri) return;
    const dbData = { group_id: groupId, user_id: userId, note: note.trim() || null };
    const fileName = `${groupId}/${userId}_${Date.now()}${cameraMode === "DESSIN" ? "_draw" : ""}.jpg`;
    startUpload(fileName, capturedUri, "image/jpeg", dbData);
    setCapturedUri(null);
    setNote("");
    setIsDrawingActive(false);
    onUploadSuccess();
  };

  const handleUploadAudio = () => {
    if (!capturedAudioUri) return;
    const dbData = { group_id: groupId, user_id: userId, note: note.trim() || null };
    const fileName = `${groupId}/${userId}_${Date.now()}.m4a`;
    startUpload(fileName, capturedAudioUri, "audio/m4a", dbData);
    setCapturedAudioUri(null);
    setNote("");
    onUploadSuccess();
  };

  const handleUploadText = () => {
    if (!textModeContent.trim()) return;
    const content = textModeContent.trim();
    const dbData = { group_id: groupId, user_id: userId, note: content };
    startUpload(null, null, null, dbData);
    setTextModeContent("");
    onUploadSuccess();
  };

  // ── Render ──

  return (
    <>
      {/* Camera view / capture modes */}
      {!capturedUri && !capturedAudioUri && (
        cameraMode === "TEXTE" ? (
          <View style={styles.textModeContainer}>
            <TextInput
              style={styles.textModeInput}
              placeholder="Écris..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              multiline
              value={textModeContent}
              onChangeText={setTextModeContent}
              autoFocus
            />
          </View>
        ) : cameraMode === "DESSIN" && !isDrawingActive ? (
          <View style={styles.audioModeContainer}>
            <Svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 20h9" />
              <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </Svg>
            <Text style={styles.audioHintText}>Appuie pour commencer à dessiner</Text>
          </View>
        ) : cameraMode === "DESSIN" && isDrawingActive ? (
          <View style={styles.fill}>
            <DrawingCanvas ref={drawingRef} color={drawingColor} />
          </View>
        ) : cameraMode === "AUDIO" ? (
          <View style={styles.audioModeContainer}>
            {isAudioRecording ? (
              <>
                <View style={styles.audioRecordingIndicator}>
                  <View style={styles.audioRedDot} />
                  <Text style={styles.audioTimerText}>
                    {Math.floor(audioSeconds / 60).toString().padStart(2, "0")}:{(audioSeconds % 60).toString().padStart(2, "0")}
                  </Text>
                </View>
                <View style={styles.audioWaveformRow} pointerEvents="none">
                  {audioWaveAnims.map(({ anim }, i) => (
                    <Animated.View key={i} style={[styles.audioWaveformBar, { transform: [{ scaleY: anim }] }]} />
                  ))}
                </View>
              </>
            ) : (
              <>
                <Svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <Path d="M12 19v4" />
                  <Path d="M8 23h8" />
                </Svg>
                <Text style={styles.audioHintText}>Appuie pour enregistrer</Text>
              </>
            )}
          </View>
        ) : (
          <View style={[styles.cameraPageContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12, paddingHorizontal: 12 }]}>
            <View style={styles.cameraInner}>
              <StandardCamera
                ref={cameraRef}
                isActive={!capturedUri}
                mode={cameraMode === "VIDEO" ? "video" : "picture"}
                facing={facing}
                flash={flash}
                zoom={zoom}
                onZoomChange={setZoom}
                onPinchingChange={setIsPinching}
                onDoubleTap={() => setFacing(prev => prev === "back" ? "front" : "back")}
              />
              {cameraMode !== "TEXTE" && (
                <TouchableOpacity
                  style={styles.flashBtn}
                  onPress={() => setFlash(prev => prev === "off" ? "on" : prev === "on" ? "auto" : "off")}
                >
                  <FlashIcon mode={flash} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )
      )}

      {/* Camera UI Overlay */}
      {!capturedUri && !capturedAudioUri && (
        <View style={styles.fill} pointerEvents="box-none">
          {cameraMode === "DESSIN" && isDrawingActive && (
            <TouchableOpacity
              pointerEvents="auto"
              style={[styles.drawingCancelBtn, { top: Math.max(insets.top, 16) + 8 }]}
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
          {isAudioRecording && (
            <View style={[styles.recordingTimer, { top: Math.max(insets.top, 40) }]}>
              <View style={[styles.recordingDot, { backgroundColor: "#A78BFA" }]} />
              <Text style={styles.recordingText}>{Math.floor(audioSeconds / 60)}:{(audioSeconds % 60).toString().padStart(2, "0")}</Text>
            </View>
          )}

          <View style={[styles.cameraFooter, { bottom: NAVBAR_HEIGHT + 24 }]}>
            {cameraMode === "DESSIN" && isDrawingActive ? (
              <View style={styles.drawingToolbar}>
                <TouchableOpacity style={styles.drawingUndoBtn} onPress={() => drawingRef.current?.undo()}>
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M1 4v6h6" /><Path d="M3.51 15a9 9 0 1 0 .49-3.51L1 10" />
                  </Svg>
                </TouchableOpacity>
                {["#FFFFFF","#FF3B30","#FF9F0A","#FFD60A","#30D158","#0A84FF","#BF5AF2","#FF375F","#000000"].map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setDrawingColor(c)}
                    style={[
                      styles.drawingColorDot,
                      { backgroundColor: c },
                      c === "#FFFFFF" && { borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
                      c === "#000000" && { borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
                      drawingColor === c && styles.drawingColorDotActive,
                    ]}
                  />
                ))}
                <TouchableOpacity style={styles.drawingUndoBtn} onPress={() => drawingRef.current?.redo()}>
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M23 4v6h-6" /><Path d="M20.49 15a9 9 0 1 1-.49-3.51L23 10" />
                  </Svg>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.modeSlider}>
                {(["PHOTO", "VIDEO", "AUDIO", "DESSIN", "TEXTE"] as CameraMode[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => { setCameraMode(m); if (m !== "DESSIN") setIsDrawingActive(false); }}
                    disabled={isRecording || isAudioRecording}
                  >
                    <Text style={[styles.modeText, cameraMode === m && styles.modeTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.captureRow}>
              {cameraMode !== "TEXTE" && <View style={styles.sideControlPlaceholder} />}
              <TouchableOpacity
                style={[
                  styles.captureBtn,
                  (cameraMode === "VIDEO" || isRecording) && styles.captureBtnVideo,
                  isRecording && styles.captureBtnRecording,
                  cameraMode === "AUDIO" && styles.captureBtnAudio,
                  isAudioRecording && styles.captureBtnAudioRecording,
                ]}
                onPress={handleCapture}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.captureInner,
                  (cameraMode === "VIDEO" || isRecording) && styles.captureInnerVideo,
                  isRecording && styles.captureInnerRecording,
                  cameraMode === "AUDIO" && styles.captureInnerAudio,
                  isAudioRecording && styles.captureInnerAudioRecording,
                ]}>
                  {cameraMode === "TEXTE" && <SendIcon color="#000" />}
                  {cameraMode === "DESSIN" && !isDrawingActive && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M12 20h9" /><Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </Svg>
                  )}
                  {cameraMode === "DESSIN" && isDrawingActive && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                  {cameraMode === "AUDIO" && !isAudioRecording && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <Path d="M12 19v4" /><Path d="M8 23h8" />
                    </Svg>
                  )}
                  {isAudioRecording && <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: "#000" }} />}
                </View>
              </TouchableOpacity>
              {cameraMode !== "TEXTE" && cameraMode !== "AUDIO" && cameraMode !== "DESSIN" && (
                <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(prev => prev === "back" ? "front" : "back")} disabled={isRecording}>
                  <FlipIcon />
                </TouchableOpacity>
              )}
              {(cameraMode === "AUDIO" || cameraMode === "DESSIN") && <View style={styles.sideControlPlaceholder} />}
            </View>
          </View>
        </View>
      )}

      {/* Photo preview */}
      {capturedUri && (
        <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12, paddingHorizontal: 12 }]}>
          <View style={styles.previewImageWrapper}>
            <Image source={{ uri: capturedUri }} style={styles.previewImage} contentFit="cover" />
            <View style={styles.fill} pointerEvents="box-none">
              <TouchableOpacity
                style={[styles.backCaptureBtnInside, { top: 16 }]}
                onPress={() => { setCapturedUri(null); setNote(""); setIsDrawingActive(false); }}
              >
                <CloseIcon />
              </TouchableOpacity>
              <View style={[styles.previewContent, { bottom: 120 }]}>
                {note ? (
                  <Pressable style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)}>
                    <Text style={styles.previewNoteText}>{note}</Text>
                  </Pressable>
                ) : (
                  <TouchableOpacity style={styles.addNoteBtn} onPress={() => setIsEditingNote(true)}>
                    <FeatherIcon />
                    <Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={[styles.postCaptureActions, { bottom: 20 }]}>
                <TouchableOpacity style={styles.sendCaptureBtn} onPress={handleUploadPhoto}>
                  <View style={styles.sendCaptureInner}>
                    <SendIcon color="#000" />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <Modal visible={isEditingNote} transparent animationType="fade">
            <BlurView intensity={100} tint="dark" style={styles.fill}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.noteEditorContainer}>
                <TextInput style={styles.largeNoteInput} placeholder="Note..." placeholderTextColor="rgba(255,255,255,0.3)" value={note} onChangeText={setNote} maxLength={140} multiline autoFocus />
                <TouchableOpacity style={styles.doneNoteBtn} onPress={() => setIsEditingNote(false)}>
                  <Text style={styles.doneNoteText}>Terminé</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </BlurView>
          </Modal>
        </View>
      )}

      {/* Audio preview */}
      {capturedAudioUri && (
        <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 12, paddingHorizontal: 12 }]}>
          <View style={[styles.previewImageWrapper, { justifyContent: "center", alignItems: "center" }]}>
            <View style={[styles.fill, { backgroundColor: "#0A0A0A" }]} />
            <TouchableOpacity
              style={[styles.backCaptureBtnInside, { top: 16 }]}
              onPress={() => { setCapturedAudioUri(null); setNote(""); }}
            >
              <CloseIcon />
            </TouchableOpacity>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }} pointerEvents="none">
              {[18,32,48,36,60,80,52,68,42,62,88,72,50,38,68,82,58,44,28,52].map((h, i) => (
                <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: "#FFF", opacity: audioPreviewStatus.currentTime > 0 && audioPreviewStatus.duration > 0 && (audioPreviewStatus.currentTime / audioPreviewStatus.duration) > i / 20 ? 0.9 : 0.25 }} />
              ))}
            </View>
            <View style={styles.audioPreviewPlayer}>
              <TouchableOpacity
                style={styles.audioPreviewPlayBtn}
                onPress={() => {
                  if (audioPreviewStatus.playing) {
                    audioPreviewPlayer.pause();
                  } else {
                    if (audioPreviewDurationRef.current > 0 && (audioPreviewStatus.currentTime ?? 0) >= audioPreviewDurationRef.current - 0.1) {
                      audioPreviewPlayer.seekTo(0);
                    }
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
                  onLayout={() => { audioPreviewSeekRef.current?.measure((_x, _y, width, _h, pageX) => { audioPreviewSeekLayoutRef.current = { pageX, width }; }); }}
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
            <View style={[styles.previewContent, { bottom: 120 }]}>
              {note ? (
                <Pressable style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)}>
                  <Text style={styles.previewNoteText}>{note}</Text>
                </Pressable>
              ) : (
                <TouchableOpacity style={styles.addNoteBtn} onPress={() => setIsEditingNote(true)}>
                  <FeatherIcon />
                  <Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.postCaptureActions, { bottom: 20 }]}>
              <TouchableOpacity style={styles.sendCaptureBtn} onPress={handleUploadAudio}>
                <View style={styles.sendCaptureInner}>
                  <SendIcon color="#000" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <Modal visible={isEditingNote} transparent animationType="fade">
            <BlurView intensity={100} tint="dark" style={styles.fill}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.noteEditorContainer}>
                <TextInput style={styles.largeNoteInput} placeholder="Note..." placeholderTextColor="rgba(255,255,255,0.3)" value={note} onChangeText={setNote} maxLength={140} multiline autoFocus />
                <TouchableOpacity style={styles.doneNoteBtn} onPress={() => setIsEditingNote(false)}>
                  <Text style={styles.doneNoteText}>Terminé</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </BlurView>
          </Modal>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  cameraPageContainer: { flex: 1, backgroundColor: "#000", alignItems: "center" },
  cameraInner: { flex: 1, width: "100%" },
  flashBtn: { position: "absolute", top: 16, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  textModeContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, backgroundColor: "#0A0A0A" },
  textModeInput: { fontSize: 32, color: "#FFF", fontFamily: "Inter_700Bold", textAlign: "center", width: "100%" },
  audioModeContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 20, backgroundColor: "#0A0A0A" },
  audioRecordingIndicator: { flexDirection: "row", alignItems: "center", gap: 12 },
  audioRedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" },
  audioTimerText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 38, letterSpacing: 2 },
  audioHintText: { color: "rgba(255,255,255,0.3)", fontFamily: "Inter_400Regular", fontSize: 13, letterSpacing: 0.5, marginTop: 4 },
  audioWaveformRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 52 },
  audioWaveformBar: { width: 3.5, height: 44, borderRadius: 2, backgroundColor: "#FFF" },
  cameraFooter: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 24 },
  modeSlider: { flexDirection: "row", gap: 20, backgroundColor: "rgba(0,0,0,0.3)", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginBottom: 12 },
  modeText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_700Bold", fontSize: 12 },
  modeTextActive: { color: "#FFF" },
  drawingToolbar: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, marginBottom: 12 },
  drawingColorDot: { width: 22, height: 22, borderRadius: 11 },
  drawingColorDotActive: { transform: [{ scale: 1.35 }], shadowColor: "#FFF", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5, elevation: 6 },
  drawingUndoBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  drawingCancelBtn: { position: "absolute", left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  captureRow: { flexDirection: "row", alignItems: "center", gap: 32 },
  sideControlPlaceholder: { width: 48 },
  flipBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  captureBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFF", justifyContent: "center", alignItems: "center" },
  captureBtnVideo: { borderColor: "rgba(255,59,48,0.5)" },
  captureBtnRecording: { borderColor: "#FF3B30" },
  captureBtnAudio: { borderColor: "rgba(255,255,255,0.4)" },
  captureBtnAudioRecording: { borderColor: "#FFF" },
  captureInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  captureInnerVideo: { backgroundColor: "#FF3B30" },
  captureInnerRecording: { width: 30, height: 30, borderRadius: 6 },
  captureInnerAudio: { backgroundColor: "#FFF" },
  captureInnerAudioRecording: { backgroundColor: "#FFF", width: 28, height: 28, borderRadius: 6 },
  recordingTimer: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" },
  recordingText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  previewContainer: { flex: 1, backgroundColor: "#000", alignItems: "center" },
  previewImageWrapper: { flex: 1, width: "100%", borderRadius: 32, overflow: "hidden", backgroundColor: "#1A1A1A" },
  previewImage: { width: "100%", height: "100%" },
  previewContent: { position: "absolute", left: 24, right: 24 },
  previewNoteBox: { backgroundColor: "rgba(0,0,0,0.5)", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  previewNoteText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  addNoteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.4)", borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  addNoteBtnText: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  backCaptureBtnInside: { position: "absolute", left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  postCaptureActions: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  sendCaptureBtn: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFF", justifyContent: "center", alignItems: "center" },
  sendCaptureInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" },
  noteEditorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  largeNoteInput: { width: "100%", color: "#FFF", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 40 },
  doneNoteBtn: { backgroundColor: "#FFF", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 100 },
  doneNoteText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 16 },
  audioPreviewPlayer: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 32, paddingHorizontal: 24, width: "100%" },
  audioPreviewPlayBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  audioPreviewSeekHitArea: { paddingVertical: 14, justifyContent: "center" },
  audioPreviewTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 2 },
  audioPreviewFill: { height: 3, backgroundColor: "#FFF", borderRadius: 2 },
  audioPreviewThumb: { position: "absolute", width: 13, height: 13, borderRadius: 7, backgroundColor: "#FFF", marginLeft: -6, top: 14 - 5 },
  audioPreviewTime: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" },
});
