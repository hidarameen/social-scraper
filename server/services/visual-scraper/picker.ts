import { BrowserService } from "./browser";

export class PickerService {
  private browserService: BrowserService;

  constructor() {
    this.browserService = BrowserService.getInstance();
  }

  async getProxyContent(url: string) {
    const content = await this.browserService.getPageContent(url);
    // Inject scripts for element selection
    const injectedScript = `
      <script>
        (function() {
          let selectedElement = null;
          let mode = 'idle';

          window.addEventListener('message', (event) => {
            if (event.data.type === 'SET_MODE') {
              mode = event.data.mode;
              document.body.style.cursor = mode === 'select' ? 'crosshair' : 'default';
            }
          });

          document.addEventListener('mouseover', (e) => {
            if (mode !== 'select') return;
            e.target.style.outline = '2px solid rgba(59, 130, 246, 0.5)';
            e.target.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
          });

          document.addEventListener('mouseout', (e) => {
            if (mode !== 'select') return;
            e.target.style.outline = '';
            e.target.style.backgroundColor = '';
          });

          document.addEventListener('click', (e) => {
            if (mode !== 'select') return;
            e.preventDefault();
            e.stopPropagation();

            const selector = getSelector(e.target);
            window.parent.postMessage({
              type: 'ELEMENT_SELECTED',
              selector: selector,
              text: e.target.textContent.trim()
            }, '*');
          });

          function getSelector(el) {
            if (el.id) return '#' + el.id;
            
            // Try to find a unique class
            if (el.classList.length > 0) {
              for (const className of el.classList) {
                if (document.querySelectorAll('.' + className).length === 1) {
                  return '.' + className;
                }
              }
            }

            let path = [];
            while (el.nodeType === Node.ELEMENT_NODE) {
              let selector = el.nodeName.toLowerCase();
              if (el.id) {
                selector += '#' + el.id;
                path.unshift(selector);
                break;
              } else {
                let sibling = el;
                let nth = 1;
                while (sibling = sibling.previousElementSibling) {
                  if (sibling.nodeName.toLowerCase() == selector) nth++;
                }
                if (nth != 1) selector += ":nth-of-type("+nth+")";
              }
              path.unshift(selector);
              el = el.parentNode;
            }
            return path.join(' > ');
          }
        })();
      </script>
    `;
    return content + injectedScript;
  }
}
