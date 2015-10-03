'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type HomeFragments from 'nuclide-home-interfaces';

var React = require('react-for-atom');

var DEFAULT_WELCOME = (
  <div>
    <p>
      Thanks for trying Nuclide, Facebook's
      <br />
      unified developer environment.
    </p>
    <p>
      We would love your feedback and contributions to continue to make it better. Please
      raise issues and pull-requests directly on
      our <a href="https://github.com/facebook/nuclide">GitHub repo</a>.
    </p>
    <p>
      Thank you!
    </p>
  </div>
);

class HomePaneItem extends HTMLElement {

  uri: string;
  allHomeFragments: Set<HomeFragments>;

  initialize(uri: string, allHomeFragments: Set<HomeFragments>): HomePaneItem {
    this.uri = uri;
    this.allHomeFragments = allHomeFragments;

    // Re-use styles from the Atom welcome pane where possible.
    this.className = 'welcome pane-item padded';
    atom.config.set('nuclide-home.showHome', true);
    this.render();
    return this;
  }

  setHomeFragments(allHomeFragments: Set<HomeFragments>): void {
    this.allHomeFragments = allHomeFragments;
    this.render();
  }

  render() {
    var welcomes = [];
    this.allHomeFragments.forEach(fragment => {
      var {welcome} = fragment;
      if (welcome) {
        welcomes.push(<div key={welcomes.length}>{welcome}</div>);
      }
    });
    if (welcomes.length === 0) {
      welcomes = DEFAULT_WELCOME;
    }

    React.render((
      <div className="welcome-container">
        <section className="text-center">
          <div className="nuclide-home-logo" />
          <h1 className="welcome-title">Welcome to Nuclide</h1>
        </section>
        <section className="text-center">
          {welcomes}
        </section>
      </div>
    ), this);
  }

  getTitle(): string {
    return 'Home';
  }

  getIconName(): string {
    return 'home';
  }

  getURI(): string {
    return this.uri;
  }

  // Return false to prevent the tab getting split (since we only update a singleton health pane).
  copy() {
    return false;
  }

  destroy(): void {
    React.unmountComponentAtNode(this);
    atom.config.set('nuclide-home.showHome', false);
  }

  serialize() {
    return {
      deserializer: 'HomePaneItem',
      uri: this.getURI(),
    };
  }
}

module.exports = HomePaneItem = document.registerElement(
  'nuclide-home-item',
  {prototype: HomePaneItem.prototype},
);
