/**
 * Shared Framer Motion variants — import from here rather than defining them
 * inline. Older pages still carry their own copies; new ones use these.
 */
export const pageVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export const listContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

export const listItemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

/** The dimmed backdrop behind a modal (use with AnimatePresence). */
export const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

/** A modal panel springing in. */
export const modalVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 400, damping: 30 } },
};
