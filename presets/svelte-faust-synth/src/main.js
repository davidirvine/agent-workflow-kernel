import { mount } from 'svelte'
import './theme.css'
import './global.css'
import App from './App.svelte'

const app = mount(App, {
  target: /** @type {HTMLElement} */ (document.getElementById('app')),
})

export default app
