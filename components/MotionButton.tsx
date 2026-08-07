"use client";

import { motion, HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";

/**
 * Feedback on pointer-down, not on release (rule 1). Critically damped
 * spring by default — snappy, no distracting overshoot (rule 4 defaults).
 */
const MotionButton = forwardRef<HTMLButtonElement, HTMLMotionProps<"button">>(
  ({ children, className, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        className={className}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);
MotionButton.displayName = "MotionButton";

export default MotionButton;
