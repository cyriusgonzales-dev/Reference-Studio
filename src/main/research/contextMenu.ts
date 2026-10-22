import { clipboard, Menu, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron';
import { isAllowedImageUrl, isHttpUrl, parseYouTubeVideo } from '../../shared/urls';

/** Actions the right-click menu of a search tab can trigger. */
export interface ResearchMenuActions {
  showImage(src: string, alt: string, href: string): void;
  playVideo(url: string, title: string): void;
  showLyrics(text: string, pageTitle: string): void;
  openExternal(url: string): void;
  allowInspect: boolean;
}

export function buildResearchContextMenu(params: ContextMenuParams, wc: WebContents, actions: ResearchMenuActions): Menu {
  const template: MenuItemConstructorOptions[] = [];
  const section = (items: MenuItemConstructorOptions[]) => {
    if (items.length === 0) return;
    if (template.length > 0) template.push({ type: 'separator' });
    template.push(...items);
  };

  if (params.mediaType === 'image' && isAllowedImageUrl(params.srcURL)) {
    section([{ label: 'Show this image', click: () => actions.showImage(params.srcURL, params.altText || params.titleText, params.linkURL) }]);
  }
  if (params.linkURL && parseYouTubeVideo(params.linkURL)) {
    section([{ label: 'Play this video', click: () => actions.playVideo(params.linkURL, params.linkText || params.titleText) }]);
  }
  if (params.selectionText.trim()) {
    section([
      { label: 'Show selected text as lyrics', click: () => actions.showLyrics(params.selectionText, wc.getTitle()) },
      { role: 'copy' }
    ]);
  }
  if (params.isEditable) {
    section([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll' }
    ]);
  }
  if (params.linkURL && isHttpUrl(params.linkURL)) {
    const link = params.linkURL;
    section([
      { label: 'Open link in system browser', click: () => actions.openExternal(link) },
      { label: 'Copy link address', click: () => clipboard.writeText(link) }
    ]);
  }
  section([
    { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
    { label: 'Reload', click: () => wc.reload() }
  ]);
  if (actions.allowInspect) section([{ label: 'Inspect element', click: () => wc.inspectElement(params.x, params.y) }]);
  return Menu.buildFromTemplate(template);
}
