'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import {DebuggerLaunchAttachProvider} from '../../nuclide-debugger-base';
import {React} from 'react-for-atom';
import {AttachUiComponent} from './AttachUiComponent';
import invariant from 'assert';

export class IwdpLaunchAttachProvider extends DebuggerLaunchAttachProvider {
  constructor(debuggingTypeName: string, targetUri: string) {
    super(debuggingTypeName, targetUri);
  }

  getActions(): Array<string> {
    return ['Attach'];
  }

  getComponent(action: string): ?React.Element<*> {
    if (action === 'Attach') {
      return <AttachUiComponent targetUri={this.getTargetUri()} />;
    } else {
      invariant(false, 'Unrecognized action for component.');
    }
  }

  dispose(): void {}
}
