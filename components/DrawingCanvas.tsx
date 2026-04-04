import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { View, StyleSheet, TouchableOpacity, PanResponder } from "react-native";
import { Canvas, Path, Fill, Skia, useCanvasRef } from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system/legacy";
import Svg, { Path as SvgPath } from "react-native-svg";

const COLORS = [
  "#FFFFFF", "#FF3B30", "#FF9F0A", "#FFD60A",
  "#30D158", "#0A84FF", "#BF5AF2", "#FF375F", "#000000",
];
const STROKE_WIDTH = 6;

export interface DrawingCanvasRef {
  capture: () => Promise<string | null>;
}

type Stroke = {
  path: ReturnType<typeof Skia.Path.Make>;
  color: string;
};

const UndoIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <SvgPath d="M3 7v6h6" />
    <SvgPath d="M3 13A9 9 0 1 0 5.7 6.7L3 7" />
  </Svg>
);

export const DrawingCanvas = forwardRef<DrawingCanvasRef>((_, ref) => {
  const canvasRef = useCanvasRef();
  const canvasViewRef = useRef<View>(null);
  const canvasLayoutRef = useRef({ pageX: 0, pageY: 0 });

  const [completedStrokes, setCompletedStrokes] = useState<Stroke[]>([]);
  const [selectedColor, setSelectedColor] = useState("#FFFFFF");
  const [, forceUpdate] = useState(0);

  const activeStrokeRef = useRef<Stroke | null>(null);
  const selectedColorRef = useRef("#FFFFFF");

  useImperativeHandle(ref, () => ({
    capture: async () => {
      const image = canvasRef.current?.makeImageSnapshot();
      if (!image) return null;
      const base64 = image.encodeToBase64();
      const uri = `${FileSystem.cacheDirectory}drawing_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return uri;
    },
  }));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.pageX - canvasLayoutRef.current.pageX;
        const y = evt.nativeEvent.pageY - canvasLayoutRef.current.pageY;
        const path = Skia.Path.Make();
        path.moveTo(x, y);
        activeStrokeRef.current = { path, color: selectedColorRef.current };
        forceUpdate((n) => n + 1);
      },
      onPanResponderMove: (evt) => {
        if (!activeStrokeRef.current) return;
        const x = evt.nativeEvent.pageX - canvasLayoutRef.current.pageX;
        const y = evt.nativeEvent.pageY - canvasLayoutRef.current.pageY;
        activeStrokeRef.current.path.lineTo(x, y);
        forceUpdate((n) => n + 1);
      },
      onPanResponderRelease: () => {
        if (activeStrokeRef.current) {
          const stroke = activeStrokeRef.current;
          setCompletedStrokes((prev) => [...prev, stroke]);
          activeStrokeRef.current = null;
        }
      },
      onPanResponderTerminate: () => {
        activeStrokeRef.current = null;
      },
    })
  ).current;

  const undo = () => setCompletedStrokes((prev) => prev.slice(0, -1));

  return (
    <View style={styles.container}>
      {/* Zone de dessin */}
      <View
        ref={canvasViewRef}
        style={styles.canvas}
        onLayout={() => {
          canvasViewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
            canvasLayoutRef.current = { pageX, pageY };
          });
        }}
        {...panResponder.panHandlers}
      >
        <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
          <Fill color="#0A0A0A" />
          {completedStrokes.map((stroke, i) => (
            <Path
              key={i}
              path={stroke.path}
              color={stroke.color}
              style="stroke"
              strokeWidth={STROKE_WIDTH}
              strokeCap="round"
              strokeJoin="round"
            />
          ))}
          {activeStrokeRef.current && (
            <Path
              path={activeStrokeRef.current.path}
              color={activeStrokeRef.current.color}
              style="stroke"
              strokeWidth={STROKE_WIDTH}
              strokeCap="round"
              strokeJoin="round"
            />
          )}
        </Canvas>

        {/* Palette + undo — flottant en haut du canvas */}
        <View style={styles.toolbar} pointerEvents="box-none">
          <View style={styles.palette} pointerEvents="auto">
            {COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                onPress={() => {
                  setSelectedColor(color);
                  selectedColorRef.current = color;
                }}
                style={[
                  styles.colorDot,
                  { backgroundColor: color },
                  color === "#FFFFFF" && styles.colorDotLight,
                  color === "#000000" && styles.colorDotDark,
                  selectedColor === color && styles.colorDotActive,
                ]}
              />
            ))}
          </View>
          <TouchableOpacity style={styles.undoBtn} onPress={undo} pointerEvents="auto">
            <UndoIcon />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

DrawingCanvas.displayName = "DrawingCanvas";
export default DrawingCanvas;

const styles = StyleSheet.create({
  container: { flex: 1 },
  canvas: { flex: 1, borderRadius: 32, overflow: "hidden" },
  toolbar: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  palette: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  colorDotLight: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  colorDotDark: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  colorDotActive: {
    transform: [{ scale: 1.3 }],
    shadowColor: "#FFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 6,
  },
  undoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
});
