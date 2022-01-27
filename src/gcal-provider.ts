import * as Fs from 'fs';
import * as ReadLine from 'readline';
import { calendar_v3, google } from 'googleapis';
import { GCalTokenCredentials } from './gcal-provider-types';
import { OAuth2Client } from 'google-auth-library';
import _ from 'underscore';

/*
  TODO list:
    - Add OAuth2 refresh.
    - list_calendars more filters parameters
    - Both list_calendars and get_calendar only uses the main(primary) calendar.
*/

function GcalProvider(this: any, _options: any) {
  const seneca: any = this;
  let oAuth2Client: OAuth2Client;
  let gCalendar: calendar_v3.Calendar;
  const ZONE = 'provider';
  const BASE = 'google-calendar';
  const TOKEN_PATH = 'config/gcal-token.json';
  const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  this.add('init:GcalProvider', init);

  seneca
    .message('role:entity,cmd:list,zone:provider,base:google-calendar,name:event', list_events)
    .message('role:entity,cmd:save,zone:provider,base:google-calendar,name:event', save_event)
    .message('role:entity,cmd:load,zone:provider,base:google-calendar,name:event', get_event)
  
  async function list_events(this:any, msg: any) {
    const { q } = msg;
    // List of possible filters:
    // https://googleapis.dev/nodejs/googleapis/latest/calendar/classes/Resource$Events.html#list
    try {
      const res = await gCalendar.events.list({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
        ...q
      });
      const items = res?.data.items;
      if (items) {
        return _.map(items, (item) => {
          return this.make$(ZONE, BASE, 'event').data$(item)
        })
      }
      return [];
    } catch (error) {
      throw new Error(error as string);
    }
  };

  async function get_event(this: any, msg: any) {
    const { q } = msg;
    const { id } = q;
    try {
      const res = await gCalendar.events.get({
        calendarId: 'primary',
        eventId: id,
      });
      return this.make$(ZONE, BASE, 'event').data$(res.data);
    } catch (error) {
      throw new Error(error as string);
    }
  }

  async function save_event(this: any, msg: any) {
    const { ent } = msg;
    const { id } = ent;
    try {
      const res = await gCalendar.events.patch({
        calendarId: 'primary',
        eventId: id,
        requestBody: {
          ...ent,
        }
      });
      return this.make$(ZONE, BASE, 'event').data$(res.data);
    } catch (error) {
      throw new Error(error as string);
    }
  }

  function init(msg: any, respond: CallableFunction) {
    Fs.readFile('config/google-cloud-credentials.json', async (err, content) => {
      if (err) {
        throw new Error(`Error loading client secret file: ${err}`);
      }
      try {
        await authorizeOAuth(JSON.parse(content.toString()));
        gCalendar = google.calendar({version: 'v3', auth: oAuth2Client});
        respond(msg);
      } catch (error) {
        throw new Error('Boot for gcal provider failed!');
      }
    });
  }

  function authorizeOAuth(credentials: GCalTokenCredentials) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    return new Promise((resolve, reject) => {
      // Check if we have previously stored a token.
      Fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) {
          const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
          });
          console.log('Authorize this app by visiting this url:', authUrl);
          const rl = ReadLine.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
              if (err) reject(`Error retrieving access token: ${err}`);
              if (token) {
                oAuth2Client.setCredentials(token);
                // Store the token to disk for later program executions
                Fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                  if (err) reject(err);
                  console.log('Token stored to', TOKEN_PATH);
                });
                resolve(true);
              }
            });
          });
        }
        oAuth2Client.setCredentials(JSON.parse(token.toString()));
        resolve(true);
      });
    })
  }

}

export default GcalProvider

if ('undefined' !== typeof (module)) {
  module.exports = GcalProvider
}