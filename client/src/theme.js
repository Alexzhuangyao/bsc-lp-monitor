import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  colors: {
    brand: {
      50: '#ffe5f7',
      100: '#ffb3e6',
      200: '#ff80d5',
      300: '#ff4dc4',
      400: '#ff1ab3',
      500: '#e600a1',
      600: '#b3007d',
      700: '#80005a',
      800: '#4d0036',
      900: '#1a0013',
    },
  },
  fonts: {
    heading: 'Kanit, sans-serif',
    body: 'Kanit, sans-serif',
  },
  components: {
    Button: {
      baseStyle: {
        borderRadius: 'xl',
      },
      variants: {
        solid: {
          bg: 'brand.500',
          color: 'white',
          _hover: {
            bg: 'brand.600',
          },
        },
        ghost: {
          _hover: {
            bg: 'brand.50',
          },
        },
      },
    },
    Table: {
      variants: {
        simple: {
          th: {
            borderColor: 'gray.200',
            fontSize: 'sm',
            fontWeight: 'medium',
            bg: 'gray.50',
          },
          td: {
            borderColor: 'gray.100',
          },
        },
      },
    },
    Tag: {
      baseStyle: {
        container: {
          borderRadius: 'full',
          px: 3,
        },
      },
      variants: {
        solid: {
          container: {
            bg: 'brand.500',
            color: 'white',
          },
        },
      },
    },
    Card: {
      baseStyle: {
        container: {
          borderRadius: 'lg',
          boxShadow: 'sm',
        },
      },
    },
  },
  styles: {
    global: {
      body: {
        bg: 'gray.50',
        color: 'gray.800',
      },
    },
  },
});

export default theme; 