"use client";

import { useState } from "react";
import { motion } from "motion/react";

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}

export function StarRating({ value, onChange, disabled = false }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hovered || value);
        return (
          <motion.button
            key={star}
            type="button"
            disabled={disabled}
            role="radio"
            aria-checked={star === value}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            className="relative p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[#d9ac5f]/50 rounded disabled:cursor-not-allowed"
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            onMouseEnter={() => !disabled && setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => !disabled && onChange(star)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill={filled ? "#d9ac5f" : "none"}
              stroke={filled ? "#d9ac5f" : "rgb(120 120 130)"}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-colors duration-200"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </motion.button>
        );
      })}
    </div>
  );
}
