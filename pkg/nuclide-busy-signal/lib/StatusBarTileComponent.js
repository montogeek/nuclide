'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import {React} from 'react-for-atom';
import classnames from 'classnames';

type Props = {
  busy: boolean,
};

export class StatusBarTileComponent extends React.Component {
  props: Props;

  constructor(props: Props) {
    super(props);
  }

  render(): React.Element<*> {
    const classes = classnames(
      'nuclide-busy-signal-status-bar',
      {'loading-spinner-tiny': this.props.busy},
    );
    return <div className={classes} />;
  }
}
