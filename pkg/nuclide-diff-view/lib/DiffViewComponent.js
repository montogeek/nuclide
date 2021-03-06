'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {
  DiffSection,
  DiffSectionStatusType,
  DiffModeType,
  OffsetMap,
  UIElement,
} from './types';
import type DiffViewModel, {State as DiffViewStateType} from './DiffViewModel';
import type {RevisionInfo} from '../../nuclide-hg-rpc/lib/HgService';
import type {NuclideUri} from '../../commons-node/nuclideUri';

import invariant from 'assert';
import {MultiRootChangedFilesView} from '../../nuclide-ui/MultiRootChangedFilesView';
import {Disposable, TextBuffer} from 'atom';
import UniversalDisposable from '../../commons-node/UniversalDisposable';
import {
  React,
  ReactDOM,
} from 'react-for-atom';
import DiffViewEditorPane from './DiffViewEditorPane';
import SyncScroll from './SyncScroll';
import DiffTimelineView from './DiffTimelineView';
import DiffViewToolbar from './DiffViewToolbar';
import DiffNavigationBar from './DiffNavigationBar';
import DiffCommitView from './DiffCommitView';
import DiffPublishView from './DiffPublishView';
import {
  computeDiff,
  computeDiffSections,
} from './diff-utils';
import createPaneContainer from '../../commons-atom/create-pane-container';
import {bufferForUri} from '../../commons-atom/text-editor';
import {
  DiffMode,
  DiffSectionStatus,
} from './constants';
import {getMultiRootFileChanges} from '../../nuclide-hg-git-bridge/lib/utils';
import {
  LoadingSpinner,
  LoadingSpinnerSizes,
} from '../../nuclide-ui/LoadingSpinner';
import {observableFromSubscribeFunction} from '../../commons-node/event';
import {Observable} from 'rxjs';

type Props = {
  diffModel: DiffViewModel,
  // A bound function that when invoked will try to trigger the Diff View NUX
  tryTriggerNux: () => void,
};

type EditorState = {
  revisionTitle: string,
  text: string,
  offsets: OffsetMap,
  highlightedLines: {
    added: Array<number>,
    removed: Array<number>,
  },
  inlineElements: Array<UIElement>,
};

type State = {
  filePath: NuclideUri,
  isLoadingFileDiff: boolean,
  oldEditorState: EditorState,
  newEditorState: EditorState,
  diffSections: Array<DiffSection>,
  selectedDiffSectionIndex: number,
};

function initialEditorState(): EditorState {
  return {
    revisionTitle: '',
    text: '',
    offsets: new Map(),
    highlightedLines: {
      added: [],
      removed: [],
    },
    inlineElements: [],
  };
}

let CachedPublishComponent;
function getPublishComponent() {
  if (CachedPublishComponent == null) {
    // Try requiring private module
    try {
      // $FlowFB
      const {DiffViewPublishForm} = require('./fb/DiffViewPublishForm');
      CachedPublishComponent = DiffViewPublishForm;
    } catch (ex) {
      CachedPublishComponent = DiffPublishView;
    }
  }
  return CachedPublishComponent;
}

let CachedDiffComponent;
function getDiffComponent() {
  if (CachedDiffComponent == null) {
    // Try requiring private module
    try {
      // $FlowFB
      const {DiffViewCreateForm} = require('./fb/DiffViewCreateForm');
      CachedDiffComponent = DiffViewCreateForm;
    } catch (ex) {
      CachedDiffComponent = DiffCommitView;
    }
  }

  return CachedDiffComponent;
}

function getInitialState(): State {
  return {
    diffSections: [],
    filePath: '',
    isLoadingFileDiff: false,
    mode: DiffMode.BROWSE_MODE,
    newEditorState: initialEditorState(),
    oldEditorState: initialEditorState(),
    selectedDiffSectionIndex: -1,
  };
}

const EMPTY_FUNCTION = () => {};
const SCROLL_FIRST_CHANGE_DELAY_MS = 100;
const DEBOUNCE_STATE_UPDATES_MS = 50;

export default class DiffViewComponent extends React.Component {
  props: Props;
  state: State;

  _subscriptions: UniversalDisposable;
  _syncScroll: SyncScroll;
  _oldEditorPane: atom$Pane;
  _oldEditorComponent: DiffViewEditorPane;
  _paneContainer: Object;
  _newEditorPane: atom$Pane;
  _newEditorComponent: DiffViewEditorPane;
  _bottomRightPane: atom$Pane;
  _timelineComponent: ?DiffTimelineView;
  _treePane: atom$Pane;
  _treeComponent: React.Component<any, any, any>;
  _navigationPane: atom$Pane;
  _navigationComponent: DiffNavigationBar;
  _publishComponent: ?React.Component<any, any, any>;
  _readonlyBuffer: atom$TextBuffer;

  constructor(props: Props) {
    super(props);
    this.state = getInitialState();
    (this: any)._updateLineDiffState = this._updateLineDiffState.bind(this);
    (this: any)._onTimelineChangeRevision = this._onTimelineChangeRevision.bind(this);
    (this: any)._handleNavigateToDiffSection = this._handleNavigateToDiffSection.bind(this);
    (this: any)._onDidUpdateTextEditorElement = this._onDidUpdateTextEditorElement.bind(this);
    (this: any)._onChangeMode = this._onChangeMode.bind(this);
    (this: any)._onSwitchToEditor = this._onSwitchToEditor.bind(this);
    (this: any)._onDidChangeScrollTop = this._onDidChangeScrollTop.bind(this);
    (this: any)._pixelRangeForDiffSection = this._pixelRangeForDiffSection.bind(this);
    this._readonlyBuffer = new TextBuffer();
    this._subscriptions = new UniversalDisposable();
  }

  componentDidMount(): void {
    const {diffModel, tryTriggerNux} = this.props;
    this._subscriptions.add(
      Observable.merge(
        observableFromSubscribeFunction(
          diffModel.onDidUpdateState.bind(diffModel)),
        observableFromSubscribeFunction(
          atom.workspace.onDidChangeActivePaneItem.bind(atom.workspace)),
      ).filter(() => {
        const activeItem = atom.workspace.getActivePaneItem();
        return activeItem != null && (activeItem: any).tagName === 'NUCLIDE-DIFF-VIEW';
      })
      .debounceTime(DEBOUNCE_STATE_UPDATES_MS)
      .subscribe(() => {
        this._updateLineDiffState(diffModel.getState());
        this.forceUpdate();
      }),
    );

    this._paneContainer = createPaneContainer();
    // The changed files status tree takes 1/5 of the width and lives on the right most,
    // while being vertically splt with the revision timeline stack pane.
    const topPane = this._newEditorPane = this._paneContainer.getActivePane();
    this._bottomRightPane = topPane.splitDown({
      flexScale: 0.3,
    });
    this._treePane = this._bottomRightPane.splitLeft({
      flexScale: 0.35,
    });
    this._navigationPane = topPane.splitRight({
      flexScale: 0.045,
    });
    this._oldEditorPane = topPane.splitLeft({
      flexScale: 1,
    });

    this._renderDiffView();

    this._subscriptions.add(
      this._destroyPaneDisposable(this._oldEditorPane),
      this._destroyPaneDisposable(this._newEditorPane),
      this._destroyPaneDisposable(this._navigationPane),
      this._destroyPaneDisposable(this._treePane),
      this._destroyPaneDisposable(this._bottomRightPane),
    );

    ReactDOM.findDOMNode(this.refs.paneContainer).appendChild(
      atom.views.getView(this._paneContainer),
    );

    this._updateLineDiffState(diffModel.getState());

    tryTriggerNux();
  }

  _setupSyncScroll(): void {
    if (this._oldEditorComponent == null || this._newEditorComponent == null) {
      return;
    }
    const oldTextEditorElement = this._oldEditorComponent.getEditorDomElement();
    const newTextEditorElement = this._newEditorComponent.getEditorDomElement();
    const syncScroll = this._syncScroll;
    if (syncScroll != null) {
      syncScroll.dispose();
      this._subscriptions.remove(syncScroll);
    }
    this._syncScroll = new SyncScroll(
      oldTextEditorElement,
      newTextEditorElement,
    );
    this._subscriptions.add(this._syncScroll);
  }

  _scrollToFirstHighlightedLine(): void {
    const {filePath} = this.state;
    // Schedule scroll to first line after all lines have been rendered.
    const scrollTimeout = setTimeout(() => {
      this._subscriptions.remove(clearScrollTimeoutSubscription);
      const {diffSections} = this.state;
      if (this.state.filePath !== filePath || diffSections.length === 0) {
        return;
      }

      const {status, lineNumber} = diffSections[0];
      this._handleNavigateToDiffSection(status, lineNumber);

    }, SCROLL_FIRST_CHANGE_DELAY_MS);
    const clearScrollTimeoutSubscription = new Disposable(() => {
      clearTimeout(scrollTimeout);
    });
    this._subscriptions.add(clearScrollTimeoutSubscription);
  }

  _onChangeMode(mode: DiffModeType): void {
    this.props.diffModel.setViewMode(mode);
  }

  _renderDiffView(): void {
    this._renderTree();
    this._renderEditors();
    this._renderNavigation();
    this._renderBottomRightPane();
  }

  _renderBottomRightPane(): void {
    const {viewMode} = this.props.diffModel.getState();
    switch (viewMode) {
      case DiffMode.BROWSE_MODE:
        this._renderTimelineView();
        this._publishComponent = null;
        break;
      case DiffMode.COMMIT_MODE:
        this._renderCommitView();
        this._timelineComponent = null;
        this._publishComponent = null;
        break;
      case DiffMode.PUBLISH_MODE:
        this._renderPublishView();
        this._timelineComponent = null;
        break;
      default:
        throw new Error(`Invalid Diff Mode: ${viewMode}`);
    }
  }

  componentDidUpdate(prevProps: Props, prevState: State): void {
    this._renderDiffView();
    if (this.state.filePath !== prevState.filePath) {
      this._scrollToFirstHighlightedLine();
      this.props.diffModel.emitActiveBufferChangeModified();
    }
  }

  _renderCommitView(): void {
    const {
      commitMessage,
      commitMode,
      commitModeState,
      shouldRebaseOnAmend,
    } = this.props.diffModel.getState();

    const DiffComponent = getDiffComponent();
    ReactDOM.render(
      <DiffComponent
        commitMessage={commitMessage}
        commitMode={commitMode}
        commitModeState={commitModeState}
        shouldRebaseOnAmend={shouldRebaseOnAmend}
        // `diffModel` is acting as the action creator for commit view and needs to be passed so
        // methods can be called on it.
        diffModel={this.props.diffModel}
      />,
      this._getPaneElement(this._bottomRightPane),
    );
  }

  _renderPublishView(): void {
    const {diffModel} = this.props;
    const {
      publishMode,
      publishModeState,
      publishMessage,
      headCommitMessage,
    } = diffModel.getState();
    const PublishComponent = getPublishComponent();
    const component = ReactDOM.render(
      <PublishComponent
        publishModeState={publishModeState}
        message={publishMessage}
        publishMode={publishMode}
        headCommitMessage={headCommitMessage}
        diffModel={diffModel}
      />,
      this._getPaneElement(this._bottomRightPane),
    );
    this._publishComponent = component;
  }

  _renderTree(): void {
    const {diffModel} = this.props;
    const {
      activeRepository,
      filePath,
      isLoadingSelectedFiles,
      selectedFileChanges,
    } = diffModel.getState();
    const rootPaths = activeRepository != null ? [activeRepository.getWorkingDirectory()] : [];

    let spinnerElement = null;
    if (isLoadingSelectedFiles) {
      spinnerElement = (
        <div className="nuclide-diff-view-loading inline-block">
          <LoadingSpinner
            className="inline-block"
            size={LoadingSpinnerSizes.EXTRA_SMALL}
          />
          <div className="inline-block">
            Refreshing Selected Files …
          </div>
        </div>
      );
    }

    this._treeComponent = ReactDOM.render(
      (
        <div className="nuclide-diff-view-tree padded">
          {spinnerElement}
          <MultiRootChangedFilesView
            commandPrefix="nuclide-diff-view"
            fileChanges={getMultiRootFileChanges(selectedFileChanges, rootPaths)}
            selectedFile={filePath}
            onFileChosen={diffModel.diffFile.bind(diffModel)}
          />
        </div>
      ),
      this._getPaneElement(this._treePane),
    );
  }

  _renderEditors(): void {
    const {
      filePath,
      isLoadingFileDiff,
      oldEditorState: oldState,
      newEditorState: newState,
    } = this.state;
    const oldEditorComponent = ReactDOM.render(
        <DiffViewEditorPane
          headerTitle={oldState.revisionTitle}
          textBuffer={this._readonlyBuffer}
          filePath={filePath}
          isLoading={isLoadingFileDiff}
          offsets={oldState.offsets}
          highlightedLines={oldState.highlightedLines}
          textContent={oldState.text}
          inlineElements={oldState.inlineElements}
          readOnly={true}
          onDidChangeScrollTop={this._onDidChangeScrollTop}
          onDidUpdateTextEditorElement={EMPTY_FUNCTION}
        />,
        this._getPaneElement(this._oldEditorPane),
    );
    invariant(oldEditorComponent instanceof DiffViewEditorPane);
    this._oldEditorComponent = oldEditorComponent;
    const textBuffer = bufferForUri(filePath);
    const newEditorComponent = ReactDOM.render(
        <DiffViewEditorPane
          headerTitle={newState.revisionTitle}
          textBuffer={textBuffer}
          filePath={filePath}
          isLoading={isLoadingFileDiff}
          offsets={newState.offsets}
          highlightedLines={newState.highlightedLines}
          inlineElements={newState.inlineElements}
          onDidUpdateTextEditorElement={this._onDidUpdateTextEditorElement}
          readOnly={false}
        />,
        this._getPaneElement(this._newEditorPane),
    );
    invariant(newEditorComponent instanceof DiffViewEditorPane);
    this._newEditorComponent = newEditorComponent;
  }

  _onDidUpdateTextEditorElement(): void {
    this._setupSyncScroll();
  }

  _renderTimelineView(): void {
    const component = ReactDOM.render(
      <DiffTimelineView
        diffModel={this.props.diffModel}
        onSelectionChange={this._onTimelineChangeRevision}
      />,
      this._getPaneElement(this._bottomRightPane),
    );
    invariant(component instanceof DiffTimelineView);
    this._timelineComponent = component;
  }

  _renderNavigation(): void {
    const {diffSections} = this.state;
    const navigationPaneElement = this._getPaneElement(this._navigationPane);
    const oldEditorElement = this._oldEditorComponent.getEditorDomElement();
    const newEditorElement = this._newEditorComponent.getEditorDomElement();
    const diffViewHeight = Math.max(
      oldEditorElement.getScrollHeight(),
      newEditorElement.getScrollHeight(),
      1, // Protect against zero scroll height while initializring editors.
    );
    const component = ReactDOM.render(
      <DiffNavigationBar
        diffSections={diffSections}
        navigationScale={navigationPaneElement.clientHeight / diffViewHeight}
        editorLineHeight={oldEditorElement.getModel().getLineHeightInPixels()}
        pixelRangeForDiffSection={this._pixelRangeForDiffSection}
        onNavigateToDiffSection={this._handleNavigateToDiffSection}
      />,
      navigationPaneElement,
    );
    invariant(component instanceof DiffNavigationBar);
    this._navigationComponent = component;
  }

  _handleNavigateToDiffSection(
    diffSectionStatus: DiffSectionStatusType,
    scrollToLineNumber: number,
  ): void {
    const textEditorElement = this._diffSectionStatusToEditorElement(diffSectionStatus);
    const textEditor = textEditorElement.getModel();
    const pixelPositionTop = textEditorElement
      .pixelPositionForBufferPosition([scrollToLineNumber, 0]).top;
    // Manually calculate the scroll location, instead of using
    // `textEditor.scrollToBufferPosition([lineNumber, 0], {center: true})`
    // because that API to wouldn't center the line if it was in the visible screen range.
    const scrollTop = pixelPositionTop
      + textEditor.getLineHeightInPixels() / 2
      - textEditorElement.clientHeight / 2;
    textEditorElement.setScrollTop(scrollTop);
  }

  _pixelRangeForDiffSection(
    diffSection: DiffSection,
  ): {top: number, bottom: number} {
    const {status, lineNumber, lineCount} = diffSection;
    const textEditorElement = this._diffSectionStatusToEditorElement(status);
    const lineHeight = textEditorElement.getModel().getLineHeightInPixels();
    return {
      top: textEditorElement.pixelPositionForBufferPosition([lineNumber, 0]).top,
      bottom: textEditorElement.pixelPositionForBufferPosition([lineNumber + lineCount - 1, 0]).top
        + lineHeight,
    };
  }

  _diffSectionStatusToEditorElement(
    diffSectionStatus: DiffSectionStatusType,
  ): atom$TextEditorElement {
    switch (diffSectionStatus) {
      case DiffSectionStatus.ADDED:
      case DiffSectionStatus.CHANGED:
        return this._newEditorComponent.getEditorDomElement();
      case DiffSectionStatus.REMOVED:
        return this._oldEditorComponent.getEditorDomElement();
      default:
        throw new Error('Invalid diff section status');
    }
  }

  _getPaneElement(pane: atom$Pane): HTMLElement {
    return atom.views.getView(pane).querySelector('.item-views');
  }

  _destroyPaneDisposable(pane: atom$Pane): IDisposable {
    return new Disposable(() => {
      ReactDOM.unmountComponentAtNode(ReactDOM.findDOMNode(this._getPaneElement(pane)));
      pane.destroy();
    });
  }

  componentWillUnmount(): void {
    this._subscriptions.dispose();
  }

  render(): React.Element<*> {
    const {
      diffSections,
      filePath,
      newEditorState,
      oldEditorState,
      selectedDiffSectionIndex,
    } = this.state;
    return (
      <div className="nuclide-diff-view-container">
        <DiffViewToolbar
          diffSections={diffSections}
          filePath={filePath}
          selectedDiffSectionIndex={selectedDiffSectionIndex}
          newRevisionTitle={newEditorState.revisionTitle}
          oldRevisionTitle={oldEditorState.revisionTitle}
          onSwitchMode={this._onChangeMode}
          onSwitchToEditor={this._onSwitchToEditor}
          onNavigateToDiffSection={this._handleNavigateToDiffSection}
        />
        <div className="nuclide-diff-view-component" ref="paneContainer" />
      </div>
    );
  }

  _onSwitchToEditor(): void {
    const diffViewNode = ReactDOM.findDOMNode(this);
    invariant(diffViewNode, 'Diff View DOM needs to be attached to switch to editor mode');
    atom.commands.dispatch(diffViewNode, 'nuclide-diff-view:switch-to-editor');
  }

  _onTimelineChangeRevision(revision: RevisionInfo): void {
    this.props.diffModel.setCompareRevision(revision);
  }

  _onDidChangeScrollTop(): void {
    const editorElements = [
      this._oldEditorComponent.getEditorDomElement(),
      this._newEditorComponent.getEditorDomElement(),
    ];

    const elementsScrollCenter = editorElements.map(editorElement => {
      const scrollTop = editorElement.getScrollTop();
      return scrollTop + editorElement.clientHeight / 2;
    });

    let selectedDiffSectionIndex = -1;

    const {diffSections} = this.state;
    // TODO(most): Pre-compute the positions of the diff sections.
    // Q: when to invalidate (line edits, UI elements & diff reloads, ..etc.)
    for (let sectionIndex = 0; sectionIndex < diffSections.length; sectionIndex++) {
      const {status, lineNumber} = diffSections[sectionIndex];
      const textEditorElement = this._diffSectionStatusToEditorElement(status);
      const sectionPixelTop = textEditorElement
        .pixelPositionForBufferPosition([lineNumber, 0]).top;

      const sectionEditorIndex = editorElements.indexOf(textEditorElement);
      const sectionEditorScrollCenter = elementsScrollCenter[sectionEditorIndex];

      if (sectionEditorScrollCenter >= sectionPixelTop) {
        selectedDiffSectionIndex = sectionIndex;
      }
    }

    this.setState({selectedDiffSectionIndex});
  }

  /**
   * Updates the line diff state on active file state change.
   */
  _updateLineDiffState(fileState: DiffViewStateType): void {
    const {
      filePath,
      isLoadingFileDiff,
      oldContents,
      newContents,
      inlineComponents,
      fromRevisionTitle,
      toRevisionTitle,
    } = fileState;

    const oldEditorElements = inlineComponents.filter(component => !component.inNewEditor);
    const newEditorElements = inlineComponents.filter(component => component.inNewEditor);

    const {addedLines, removedLines, oldLineOffsets, newLineOffsets} =
      computeDiff(oldContents, newContents);

    const oldEditorState = {
      revisionTitle: fromRevisionTitle,
      text: oldContents,
      offsets: oldLineOffsets,
      highlightedLines: {
        added: [],
        removed: removedLines,
      },
      inlineElements: oldEditorElements,
    };
    const newEditorState = {
      revisionTitle: toRevisionTitle,
      text: newContents,
      offsets: newLineOffsets,
      highlightedLines: {
        added: addedLines,
        removed: [],
      },
      inlineElements: newEditorElements,
    };

    const diffSections = computeDiffSections(
      addedLines,
      removedLines,
      oldLineOffsets,
      newLineOffsets,
    );

    this.setState({
      diffSections,
      filePath,
      isLoadingFileDiff,
      newEditorState,
      oldEditorState,
    });
  }
}
