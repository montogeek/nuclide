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
import {Block} from './Block';
import {
  ListView,
  ListViewItem,
} from './ListView';
import {Checkbox} from './Checkbox';
import {MultiSelectList} from './MultiSelectList';

const NOOP = () => {};

const ListviewExample1 = (): React.Element<*> => (
  <Block>
    <ListView alternateBackground={true}>
      <ListViewItem value={{id: 1}}>test1</ListViewItem>
      <ListViewItem value={{id: 2}}>test2</ListViewItem>
      <ListViewItem value={{id: 3}}>test3</ListViewItem>
      <ListViewItem value={{id: 4}}>test4</ListViewItem>
      <ListViewItem value={{id: 5}}>test5</ListViewItem>
    </ListView>
  </Block>
);
const ListviewExample2 = (): React.Element<*> => (
  <Block>
    <ListView alternateBackground={true}>
      <ListViewItem>
        <Checkbox
          checked={true}
          onClick={NOOP}
          onChange={NOOP}
          label="A Checkbox."
        />
      </ListViewItem>
      <ListViewItem>
        <Checkbox
          checked={true}
          onClick={NOOP}
          onChange={NOOP}
          label="A Checkbox."
        />
      </ListViewItem>
      <ListViewItem>
        <Checkbox
          checked={true}
          onClick={NOOP}
          onChange={NOOP}
          label="A Checkbox."
        />
      </ListViewItem>
      <ListViewItem>
        <Checkbox
          checked={false}
          onClick={NOOP}
          onChange={NOOP}
          label="A Checkbox."
        />
      </ListViewItem>
      <ListViewItem>
        <Checkbox
          checked={false}
          onClick={NOOP}
          onChange={NOOP}
          label="A Checkbox."
        />
      </ListViewItem>
    </ListView>
  </Block>
);

class MultiSelectListExample extends React.Component {
  state: {value: Array<number>};
  constructor(props: void) {
    super(props);
    this.state = {value: [2]};
  }
  render(): React.Element<*> {
    const options = [
      {value: 1, label: 'One'},
      {value: 2, label: 'Two'},
      {value: 3, label: 'Three'},
      {value: 4, label: 'Four'},
    ];

    return (
      <MultiSelectList
        options={options}
        value={this.state.value}
        onChange={value => { this.setState({value}); }}
      />
    );
  }
}

export const ListviewExamples = {
  sectionName: 'ListView',
  description: '',
  examples: [
    {
      title: 'Simple ListView',
      component: ListviewExample1,
    },
    {
      title: 'Arbitrary components as list items',
      component: ListviewExample2,
    },
    {
      title: 'Multi-Select List',
      component: MultiSelectListExample,
    },
  ],
};
