'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import classnames from 'classnames';
import {React} from 'react-for-atom';

export type HighlightColor = 'default' | 'info' | 'success' | 'warning' | 'error';

type Props = {
  className?: string,
  color?: HighlightColor,
  children?: ?React.Element<*>,
};

export const HighlightColors = Object.freeze({
  default: 'default',
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
});

const HighlightColorClassNames = Object.freeze({
  default: 'highlight',
  info: 'highlight-info',
  success: 'highlight-success',
  warning: 'highlight-warning',
  error: 'highlight-error',
});

export const Highlight = (props: Props) => {
  const {
    className,
    color,
    children,
    ...remainingProps
  } = props;
  const colorClassName = HighlightColorClassNames[color == null ? 'default' : color];
  const newClassName = classnames(colorClassName, className);
  return <span className={newClassName} {...remainingProps}>{children}</span>;
};
