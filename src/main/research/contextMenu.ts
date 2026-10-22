import { clipboard, Menu, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron';
import { imageItemFromContext, videoItemFromUrl } from '../../shared/researchItems';
import type { PresentableItem, ResearchState } from '../../shared/types';
import { isGoogleThumbnailUrl, isHttpUrl } from '../../shared/urls';

export interface ResearchMenuActions {
  present(item: PresentableItem): void;
  preview(item: PresentableItem): void;
  queue(item: PresentableItem, position: 'end' | 'next'): void;
  bookmark(title: string, url: string): void;
  openExternal(url: string): void;
  openHere(url: string): void;
  allowInspect: boolean;
}

function itemActions(label: string, item: PresentableItem, actions: ResearchMenuActions): MenuItemConstructorOptions[] {
  return [
    { label: `Present ${label}`, click: () => actions.present(item) },
    { label: `Preview ${label}`, click: () => actions.preview(item) },
    { label: `Add ${label} to Queue`, click: () => actions.queue(item, 'end') },
    { label: `Add ${label} to Queue (Play Next)`, click: () => actions.queue(item, 'next') }
  ];
}

export function buildResearchContextMenu(
  params: ContextMenuParams,
  wc: WebContents,
  actions: ResearchMenuActions,
  state: ResearchState
): Menu {
  const template: MenuItemConstructorOptions[] = [];
  const section = (items: MenuItemConstructorOptions[]) => {
    if (items.length === 0) return;
    if (template.length > 0) template.push({ type: 'separator' });
    template.push(...items);
  };

  if (params.mediaType === 'image') {
    const item = imageItemFromContext(params);
    if (item) {
      const thumbOnly = isGoogleThumbnailUrl(item.imageUrl);
      section([
        ...(thumbOnly
          ? [{ label: 'Thumbnail only — open the result for the full-size image', enabled: false } as MenuItemConstructorOptions]
          : []),
        ...itemActions('Image', item, actions)
      ]);
    } else {
      section([{ label: 'This image cannot be presented (unsupported source)', enabled: false }]);
    }
  }

  const linkVideo = params.linkURL ? videoItemFromUrl(params.linkURL, params.linkText || params.titleText || '') : null;
  if (linkVideo) {
    section(itemActions('Linked Video', linkVideo, actions));
  } else if (state.detectedVideo && params.mediaType !== 'image') {
    section(itemActions('This Video', state.detectedVideo, actions));
  }

  if (params.linkURL && isHttpUrl(params.linkURL)) {
    const link = params.linkURL;
    section([
      { label: 'Open Link Here', click: () => actions.openHere(link) },
      { label: 'Open Link in System Browser', click: () => actions.openExternal(link) },
      { label: 'Copy Link Address', click: () => clipboard.writeText(link) }
    ]);
  }

  if (params.mediaType === 'image' && params.srcURL && !params.srcURL.startsWith('data:')) {
    const src = params.srcURL;
    section([{ label: 'Copy Image Address', click: () => clipboard.writeText(src) }]);
  }

  if (params.isEditable) {
    section([
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll' }
    ]);
  } else if (params.selectionText.trim()) {
    section([{ role: 'copy' }]);
  }

  section([
    { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
    { label: 'Reload', click: () => wc.reload() },
    {
      label: 'Bookmark This Page',
      enabled: isHttpUrl(params.pageURL),
      click: () => actions.bookmark(wc.getTitle() || params.pageURL, params.pageURL)
    }
  ]);

  if (actions.allowInspect) {
    section([{ label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) }]);
  }

  return Menu.buildFromTemplate(template);
}
