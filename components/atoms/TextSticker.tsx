import React from "react";
import { Svg, Text as SvgText, Defs, Mask, Rect } from "react-native-svg";
import { typography } from "../../lib/theme";

interface TextStickerProps {
  text: string;
  fontSize?: number;
  backgroundColor?: string;
}

export const TextSticker = ({ 
  text, 
  fontSize = 42, 
  backgroundColor = "#E6005C" 
}: TextStickerProps) => {
  const displayValue = (text || "—").toUpperCase();
  
  // Extremely tight width/height calculations
  const height = fontSize * 1.05;
  const width = (displayValue.length * fontSize * 0.6) + 8;
  const xCenter = width / 2;
  const yCenter = height / 2;

  return (
    <Svg height={height} width={width} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <Mask id="knockoutMask">
          {/* White defines the shape of the pink rectangle */}
          <Rect width={width} height={height} fill="#FFFFFF" />
          
          {/* Black cuts the text out of that shape */}
          <SvgText
            fill="#000000" 
            fontSize={fontSize}
            fontWeight="900"
            fontFamily={typography.family.bold}
            x={xCenter}
            y={yCenter}
            textAnchor="middle"
            alignmentBaseline="central"
          >
            {displayValue}
          </SvgText>
        </Mask>
      </Defs>

      {/* The pink rectangle with the text hole cut out */}
      <Rect
        width={width}
        height={height}
        fill={backgroundColor}
        mask="url(#knockoutMask)"
      />
    </Svg>
  );
};
