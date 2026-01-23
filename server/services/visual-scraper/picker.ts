import { BrowserService } from "./browser";

export class PickerService {
  private browserService: BrowserService;

  constructor() {
    this.browserService = BrowserService.getInstance();
  }

  async getProxyContent(url: string) {
    const { content, sections } = await this.browserService.getPageContent(url);
    // Inject scripts for element selection and style improvements
    const injectedScript = `
      <style>
        /* Force pointer events on body for selection but allow clicking through hidden overlays */
        body { pointer-events: auto !important; }
        /* Highlighting for hover */
        .visual-scraper-hover {
          outline: 3px solid #3b82f6 !important;
          outline-offset: -3px;
          background-color: rgba(59, 130, 246, 0.2) !important;
          cursor: crosshair !important;
          transition: all 0.1s ease-in-out;
        }
        /* Ensure the base tag doesn't break our picker UI if we had any */
      </style>
      <script>
        (function() {
          let selectedElement = null;
          let mode = 'idle';

          // Hide overlays that might block selection in the picker
          const hideOverlays = () => {
            const selectors = [
              '#onetrust-consent-sdk', 
              '.onetrust-pc-dark-filter', 
              '[id*="cookie"]', 
              '[class*="cookie"]',
              '[class*="Overlay"]',
              '[id*="Overlay"]'
            ];
            selectors.forEach(s => {
              document.querySelectorAll(s).forEach(el => {
                el.style.visibility = 'hidden';
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
              });
            });
            document.body.style.overflow = 'auto';
            document.body.style.position = 'static';
          };

          window.addEventListener('message', (event) => {
            if (event.data.type === 'SET_MODE') {
              mode = event.data.mode;
              document.body.style.cursor = mode === 'select' ? 'crosshair' : 'default';
              if (mode === 'select') {
                hideOverlays();
                // Periodically hide overlays in case they reappear
                const interval = setInterval(() => {
                  if (mode !== 'select') clearInterval(interval);
                  hideOverlays();
                }, 2000);
              }
            }
          });

          document.addEventListener('mouseover', (e) => {
            if (mode !== 'select') return;
            e.target.classList.add('visual-scraper-hover');
          });

          document.addEventListener('mouseout', (e) => {
            if (mode !== 'select') return;
            e.target.classList.remove('visual-scraper-hover');
          });

          // Prevent links from navigating in selection mode and handle dynamic pathing
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
          }, true);

          // Handle navigation inside the picker by notifying the parent
          document.addEventListener('click', (e) => {
            if (mode === 'select') return;
            const link = e.target.closest('a');
            if (link && link.href) {
              e.preventDefault();
              window.parent.postMessage({
                type: 'NAVIGATE',
                url: link.href
              }, '*');
            }
          });

          function getSelector(el) {
            // Smart link detection: if clicking inside an <a>, prioritize the link
            const nearestLink = el.closest('a');
            if (nearestLink && (el.tagName === 'IMG' || el.tagName.match(/^H[1-6]$/))) {
              el = nearestLink;
            }

            // Smart content detection: if clicking a paragraph or span, 
            // look up for a container that holds multiple paragraphs or significant text
            if (el.tagName === 'P' || el.tagName === 'SPAN') {
              let current = el;
              for (let i = 0; i < 3; i++) {
                const parent = current.parentElement;
                if (parent && (parent.querySelectorAll('p').length > 1 || parent.textContent.length > 500)) {
                  el = parent;
                  break;
                }
                current = parent;
                if (!current || current.tagName === 'BODY') break;
              }
            }

            if (el.id) return '#' + el.id;
            
            // List detection: find a class that repeats across similar elements
            if (el.classList.length > 0) {
              const classes = Array.from(el.classList).filter(c => !c.includes('visual-scraper'));
              
              // First, check for common repeating classes (lists/cards)
              for (const className of classes) {
                const count = document.querySelectorAll('.' + className).length;
                if (count > 1 && count < 50) {
                  return '.' + className;
                }
              }

              // Fallback to unique class
              for (const className of classes) {
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
