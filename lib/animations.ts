import { Variants } from 'framer-motion'

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.2, ease: 'easeOut' }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.15, ease: 'easeIn' }
  }
}

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
  },
  exit: { 
    opacity: 0, 
    y: -6,
    transition: { duration: 0.15, ease: 'easeIn' }
  }
}

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -12 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
  },
  exit: { 
    opacity: 0, 
    y: 6,
    transition: { duration: 0.15, ease: 'easeIn' }
  }
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
  },
  exit: { 
    opacity: 0, 
    scale: 0.97,
    transition: { duration: 0.15, ease: 'easeIn' }
  }
}

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
  },
  exit: { 
    opacity: 0, 
    x: 40,
    transition: { duration: 0.15, ease: 'easeIn' }
  }
}

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
  },
  exit: { 
    opacity: 0, 
    x: -40,
    transition: { duration: 0.15, ease: 'easeIn' }
  }
}

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.02,
    }
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.02,
      staggerDirection: -1,
    }
  }
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
  },
  exit: { 
    opacity: 0, 
    y: -6,
    transition: { duration: 0.1 }
  }
}

export const modalBackdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.15 }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.1 }
  }
}

export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { 
      duration: 0.2, 
      ease: [0.22, 1, 0.36, 1]
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.97, 
    y: 6,
    transition: { duration: 0.15, ease: 'easeIn' }
  }
}

export const cardHover = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.02,
    transition: { duration: 0.3, ease: 'easeOut' }
  },
  tap: { 
    scale: 0.98,
    transition: { duration: 0.1 }
  }
}

export const buttonHover = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.05,
    transition: { duration: 0.2, ease: 'easeOut' }
  },
  tap: { 
    scale: 0.95,
    transition: { duration: 0.1 }
  }
}

export const tabSwitch: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.15, ease: 'easeOut' }
  },
  exit: { 
    opacity: 0, 
    x: 10,
    transition: { duration: 0.1 }
  }
}

export const numberCount = {
  initial: { opacity: 0, y: 10 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' }
  }
}

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.25, 
      ease: [0.22, 1, 0.36, 1],
      when: 'beforeChildren',
      staggerChildren: 0.03
    }
  },
  exit: { 
    opacity: 0,
    y: -10,
    transition: { duration: 0.15, ease: 'easeIn' }
  }
}

export const statsCardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 10 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { 
      duration: 0.25, 
      ease: [0.22, 1, 0.36, 1]
    }
  }
}

export const listItemVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
  }
}

export const springConfig = {
  type: 'spring',
  stiffness: 300,
  damping: 30
}

export const smoothSpring = {
  type: 'spring',
  stiffness: 100,
  damping: 20
}
