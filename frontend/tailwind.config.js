/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  // Clases de componentes que se arman dinámicamente (p. ej. `badge-${tone}`):
  // Tailwind no puede verlas en el código fuente, así que se conservan explícitamente.
  safelist: [
    { pattern: /^badge-(success|error|warning|info|neutral|brand)$/ },
    { pattern: /^btn-(primary|ghost|danger|success)$/ },
    { pattern: /^notice-(error|success|warning|info)$/ },
  ],
  theme: {
    extend: {
      // Los colores viven en variables CSS (index.css) para que el color de la
      // tienda activa pueda cambiarse en tiempo de ejecución.
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      screens: {
        xs: '480px',
      },
    },
  },
  plugins: [],
}
