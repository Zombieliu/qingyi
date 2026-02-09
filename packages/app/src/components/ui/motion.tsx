"use client";

import * as React from "react";
import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1];

const pageVariants = {
  initial: { opacity: 0, y: 12, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(6px)" },
};

export function PageTransition({
  children,
  routeKey,
  className,
}: {
  children: React.ReactNode;
  routeKey: string;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        className={cn("motion-page", className)}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.35, ease }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

const staggerContainer = (delay = 0) => ({
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      delayChildren: delay,
      staggerChildren: 0.08,
    },
  },
});

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease } },
};

export function Stagger({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div className={cn(className)} variants={staggerContainer(delay)} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  ...props
}: HTMLMotionProps<"div">) {
  return (
    <motion.div className={cn(className)} variants={staggerItem} {...props}>
      {children}
    </motion.div>
  );
}

export function MotionCard({
  children,
  className,
  ...props
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={cn(className)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
