import dateformat from 'dateformat';
import yaml from 'js-yaml';
import { Component, Fragment, createRef } from 'react';
import {
  Box,
  Button,
  Dropdown,
  Icon,
  Section,
  Stack,
  Table,
} from 'tgui-core/components';
import { classes } from 'tgui-core/react';

import { resolveAsset } from '../assets';
import { useBackend } from '../backend';
import { Window } from '../layouts';

const icons = {
  add: { icon: 'check-circle' },
  admin: { icon: 'user-shield' },
  balance: { icon: 'balance-scale-right' },
  bugfix: { icon: 'bug' },
  code_imp: { icon: 'code' },
  config: { icon: 'cogs' },
  expansion: { icon: 'check-circle' },
  experiment: { icon: 'radiation' },
  image: { icon: 'image' },
  imageadd: { icon: 'tg-image-plus' },
  imagedel: { icon: 'tg-image-minus' },
  qol: { icon: 'hand-holding-heart' },
  refactor: { icon: 'tools' },
  rscadd: { icon: 'check-circle' },
  rscdel: { icon: 'times-circle' },
  server: { icon: 'server' },
  sound: { icon: 'volume-high' },
  soundadd: { icon: 'tg-sound-plus' },
  sounddel: { icon: 'tg-sound-minus' },
  spellcheck: { icon: 'spell-check' },
  map: { icon: 'map' },
  tgs: { icon: 'toolbox' },
  tweak: { icon: 'wrench' },
  unknown: { icon: 'info-circle' },
  wip: { icon: 'hammer' },
};

export class Changelog extends Component {
  constructor(props) {
    super(props);
    this.state = {
      data: 'Loading changelog data...',
      selectedDate: '',
      selectedIndex: 0,
    };
    this.dateChoices = [];
    this.entriesRef = createRef();
  }

  setData(data) {
    this.setState({ data });
  }

  setSelectedDate(selectedDate) {
    this.setState({ selectedDate });
  }

  setSelectedIndex(selectedIndex) {
    this.setState({ selectedIndex });
  }

  getData = (date, attemptNumber = 1) => {
    const { act } = useBackend();
    const self = this;
    const maxAttempts = 6;
    if (attemptNumber === 1) this.requestedDate = date;
    if (date !== this.requestedDate) return;

    if (attemptNumber > maxAttempts) {
      return this.setData(`Failed to load data after ${maxAttempts} attempts`);
    }

    act('get_month', { date });

    fetch(resolveAsset(`${date}.yml`)).then(async (changelogData) => {
      const result = await changelogData.text();
      if (date !== this.requestedDate) return;
      const errorRegex = /^Cannot find/;

      if (errorRegex.test(result)) {
        const timeout = 50 + attemptNumber * 50;

        self.setData(`Loading changelog data${'.'.repeat(attemptNumber + 3)}`);
        setTimeout(() => {
          self.getData(date, attemptNumber + 1);
        }, timeout);
      } else {
        self.setData(yaml.load(result, { schema: yaml.CORE_SCHEMA }));
      }
    });
  };

  componentDidMount() {
    const {
      data: { dates = [] },
    } = useBackend();

    if (dates.length) {
      dates.forEach((date) =>
        this.dateChoices.push(dateformat(date, 'mmmm yyyy', true)),
      );
      this.setSelectedDate(this.dateChoices[0]);
      this.getData(dates[0]);
    } else {
      this.setData('No changelog archives are available.');
    }
  }

  render() {
    const { data, selectedDate, selectedIndex } = this.state;
    const {
      data: { dates },
    } = useBackend();
    const { dateChoices } = this;

    const dateDropdown = dateChoices.length > 0 && (
      <Stack>
        <Stack.Item>
          <Button
            className="Changelog__Button"
            disabled={selectedIndex === 0}
            icon={'chevron-left'}
            aria-label="Newer month"
            title="Newer month"
            onClick={() => {
              const index = selectedIndex - 1;

              this.setData('Loading changelog data...');
              this.setSelectedIndex(index);
              this.setSelectedDate(dateChoices[index]);
              if (this.entriesRef.current) this.entriesRef.current.scrollTop = 0;
              return this.getData(dates[index]);
            }}
          />
        </Stack.Item>
        <Stack.Item>
          <Dropdown
            autoScroll={false}
            options={dateChoices}
            onSelected={(value) => {
              const index = dateChoices.indexOf(value);

              this.setData('Loading changelog data...');
              this.setSelectedIndex(index);
              this.setSelectedDate(value);
              if (this.entriesRef.current) this.entriesRef.current.scrollTop = 0;
              return this.getData(dates[index]);
            }}
            selected={selectedDate}
            width="210px"
          />
        </Stack.Item>
        <Stack.Item>
          <Button
            className="Changelog__Button"
            disabled={selectedIndex === dateChoices.length - 1}
            icon={'chevron-right'}
            aria-label="Older month"
            title="Older month"
            onClick={() => {
              const index = selectedIndex + 1;

              this.setData('Loading changelog data...');
              this.setSelectedIndex(index);
              this.setSelectedDate(dateChoices[index]);
              if (this.entriesRef.current) this.entriesRef.current.scrollTop = 0;
              return this.getData(dates[index]);
            }}
          />
        </Stack.Item>
      </Stack>
    );

    const credits = (
      <details className="Changelog__credits">
        <summary>Credits &amp; licenses</summary>
        <div className="Changelog__creditsBody">
          <p>
            <b>Thanks to: </b>
            Baystation 12, /vg/station, NTstation, CDK Station devs,
            FacepunchStation, GoonStation devs, the original Space Station 13
            developers, Invisty for the title image and the countless others who
            have contributed to the game, issue tracker or wiki over the years.
          </p>
          <p>
            {'Current organization members can be found '}
            <a href="https://github.com/orgs/Rotwood-Vale/people">here</a>
            {', recent GitHub contributors can be found '}
            <a href="https://github.com/Rotwood-Vale/Ratwood-Keep/pulse/monthly">
              here
            </a>
            .
          </p>
          <p>
            {'You can also join our discord '}
            <a href="https://discord.com/invite/MfG4bvN8ns">here</a>.
          </p>
          <h3>GoonStation 13 Development Team</h3>
          <p>
            <b>Coders: </b>
            Stuntwaffle, Showtime, Pantaloons, Nannek, Keelin, Exadv1, hobnob,
            Justicefries, 0staf, sniperchance, AngriestIBM, BrianOBlivion
          </p>
          <p>
            <b>Spriters: </b>
            Supernorn, Haruhi, Stuntwaffle, Pantaloons, Rho, SynthOrange, I Said
            No
          </p>
          <p>
            Traditional Games Space Station 13 is thankful to the GoonStation 13
            Development Team for its work on the game up to the
            {' r4407 release. The changelog for changes up to r4407 can be seen '}
            <a href="https://wiki.ss13.co/Pre-2016_Changelog#April_2010">here</a>.
          </p>
          <p>
            {'Except where otherwise noted, Goon Station 13 is licensed under a '}
            <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">
              Creative Commons Attribution-Noncommercial-Share Alike 3.0 License
            </a>
            {'. Rights are currently extended to '}
            <a href="http://forums.somethingawful.com/">SomethingAwful Goons</a>
            {' only.'}
          </p>
          <h3>Traditional Games Space Station 13 License</h3>
          <p>
            {'All code after '}
            <a
              href={
                'https://github.com/tgstation/tgstation/commit/' +
                '333c566b88108de218d882840e61928a9b759d8f'
              }
            >
              commit 333c566b88108de218d882840e61928a9b759d8f on 2014/31/12 at
              4:38 PM PST
            </a>
            {' is licensed under '}
            <a href="https://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL v3</a>
            {'. All code before that commit is licensed under '}
            <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL v3</a>
            {', including tools unless their readme specifies otherwise. See '}
            <a href="https://github.com/tgstation/tgstation/blob/master/LICENSE">
              LICENSE
            </a>
            {' and '}
            <a href="https://github.com/tgstation/tgstation/blob/master/GPLv3.txt">
              GPLv3.txt
            </a>
            {' for more details.'}
          </p>
          <p>
            The TGS DMAPI API is licensed as a subproject under the MIT license.
            {' See the footer of '}
            <a
              href={
                'https://github.com/tgstation/tgstation/blob/master' +
                '/code/__DEFINES/tgs.dm'
              }
            >
              code/__DEFINES/tgs.dm
            </a>
            {' and '}
            <a
              href={
                'https://github.com/tgstation/tgstation/blob/master' +
                '/code/modules/tgs/LICENSE'
              }
            >
              code/modules/tgs/LICENSE
            </a>
            {' for the MIT license.'}
          </p>
          <p>
            {'All assets including icons and sound are under a '}
            <a href="https://creativecommons.org/licenses/by-sa/3.0/">
              Creative Commons 3.0 BY-SA license
            </a>
            {' unless otherwise indicated.'}
          </p>
        </div>
      </details>
    );

    const changes =
      data &&
      typeof data === 'object' &&
      Object.keys(data).length > 0 &&
      Object.entries(data)
        .reverse()
        .map(([date, authors]) => (
          <Section className="Changelog__day" key={date} title={dateformat(date, 'd mmmm yyyy', true)}>
            <Box>
              {Object.entries(authors).map(([name, changes]) => (
                <Fragment key={name}>
                  <h3 className="Changelog__author">{name}</h3>
                  <Box>
                    <Table>
                      {changes.map((change) => {
                        const changeType = Object.keys(change)[0];
                        return (
                          <Table.Row key={changeType + change[changeType]}>
                            <Table.Cell
                              className={classes([
                                'Changelog__Cell',
                                'Changelog__Cell--Icon',
                              ])}
                            >
                              <Icon
                                color="#b9a6a0"
                                name={
                                  icons[changeType]
                                    ? icons[changeType].icon
                                    : icons.unknown.icon
                                }
                              />
                            </Table.Cell>
                            <Table.Cell className="Changelog__Cell Changelog__description">
                              {change[changeType]}
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table>
                  </Box>
                </Fragment>
              ))}
            </Box>
          </Section>
        ));

    return (
      <Window title="Changelog" width={760} height={700}>
        <Window.Content className="Changelog">
          <div className="Changelog__layout">
            <header className="Changelog__masthead">
              <h1>Changelog</h1>
              <nav className="Changelog__navigation" aria-label="Changelog month">
                {dateDropdown}
              </nav>
            </header>
            <div className="Changelog__entries" ref={this.entriesRef}>
              {credits}
              {changes}
              {typeof data === 'string' && <p className="Changelog__status">{data}</p>}
            </div>
          </div>
        </Window.Content>
      </Window>
    );
  }
}
