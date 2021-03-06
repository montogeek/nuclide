'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {ButtonSize} from '../../../nuclide-ui/Button';

import {Button} from '../../../nuclide-ui/Button';
import {Icon} from '../../../nuclide-ui/Icon';
import {React} from 'react-for-atom';

type Props = {
  icon?: atom$Octicon,
  selected?: boolean,
  size?: ButtonSize,
  children?: mixed,
  iconComponent: ReactClass<any>,
};

export function TaskRunnerButton(props: Props): React.Element<*> {
  const IconComponent = props.iconComponent;
  const buttonProps = {...props};
  delete buttonProps.icon;
  delete buttonProps.label;
  delete buttonProps.iconComponent;
  const icon = props.icon == null
    ? null
    : <Icon icon={props.icon} className="nuclide-task-runner-system-task-icon" />;
  return (
    // $FlowFixMe
    <Button
      {...buttonProps}
      className="nuclide-task-runner-system-task-button">
      <div className="nuclide-task-runner-system-icon-wrapper">
        <IconComponent />
      </div>
      <div className="nuclide-task-runner-system-task-button-divider" />
      {icon}
      {props.children}
    </Button>
  );
}
