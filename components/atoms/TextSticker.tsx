import React from "react";
import { View } from "react-native";
import { Svg, Text as SvgText } from "react-native-svg";
import { typography } from "../../lib/theme";

interface TextStickerProps {
  text: string;
  fontSize?: number;
}

export const TextSticker = ({ text, fontSize = 42 }: TextStickerProps) => {
  const displayValue = (text || "—").toUpperCase();
  const scale = fontSize / 42;
  const height = scale * 80;
  const width = (displayValue.length * fontSize * 0.85) + (20 * scale);
  const y = scale * 55;
  const strokeWidth = 5;

  return (
    <View style={{ height, width, justifyContent: 'center', alignItems: 'center' }}>
      <Svg height={height} width={width} overflow="visible">
        <SvgText
          fill="none"
          stroke="#FFF065"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fontSize={fontSize}
          fontWeight="bold"
          fontFamily={typography.family.bold}
          x="50%"
          y={y}
          textAnchor="middle"
        >
          {displayValue}
        </SvgText>
        <SvgText
          fill="black"
          fontSize={fontSize}
          fontWeight="bold"
          fontFamily={typography.family.bold}
          x="50%"
          y={y}
          textAnchor="middle"
        >
          {displayValue}
        </SvgText>
      </Svg>
    </View>
  );
};
