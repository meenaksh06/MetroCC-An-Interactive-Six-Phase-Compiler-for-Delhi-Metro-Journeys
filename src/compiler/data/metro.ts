/**
 * Delhi Metro subset used by MetroCC — THE file to verify.
 *
 * 5 lines, 56 stations, 6 modelled interchanges. Station order inside each route
 * IS the direction of travel: index increasing = towards `towards[1]`,
 * index decreasing = towards `towards[0]` (real end-of-line termini, even when
 * the terminus itself is outside this subset).
 *
 * Distances are approximate inter-station kilometres (rounded to 0.1 km).
 * Running time per hop is derived from distance by `hopMinutes` below.
 * Fares follow the DMRC distance slabs (revised Aug 2025, normal days);
 * DMRC charges by the SHORTEST path between origin and destination.
 */
import type { LineId } from '../types';

export interface Route {
  /** Ordered station list; order = direction of travel. */
  stations: string[];
  /** km[i] = distance between stations[i] and stations[i+1]. */
  km: number[];
  /** [terminus when travelling with decreasing index, terminus with increasing index]. */
  towards: [string, string];
}

export interface LineDef {
  id: LineId;
  name: string;
  color: string;
  routes: Route[];
}

export interface StationDef {
  id: string;
  aliases?: string[]; // former / alternate names accepted by the semantic phase
  x: number; // schematic map coordinates (SVG units)
  y: number;
  label: 'l' | 'r' | 't' | 'b';
  otherLines?: string[]; // real interchanges to lines NOT modelled here (display only)
}

export const LINES: LineDef[] = [
  {
    id: 'Yellow',
    name: 'Yellow Line',
    color: '#FFCC00',
    routes: [
      {
        towards: ['Samaypur Badli', 'Millennium City Centre Gurugram'],
        stations: [
          'Jahangirpuri', 'Adarsh Nagar', 'Azadpur', 'Model Town', 'GTB Nagar', 'Vishwavidyalaya',
          'Vidhan Sabha', 'Civil Lines', 'Kashmere Gate', 'Chandni Chowk', 'Chawri Bazar', 'New Delhi',
          'Rajiv Chowk', 'Patel Chowk', 'Central Secretariat', 'Udyog Bhawan', 'Lok Kalyan Marg',
          'Jor Bagh', 'INA', 'AIIMS', 'Green Park', 'Hauz Khas',
        ],
        km: [1.3, 1.5, 1.4, 1.4, 0.8, 1.0, 1.3, 1.1, 1.1, 1.0, 0.8, 1.1, 1.3, 0.9, 0.3, 1.6, 1.2, 1.3, 0.8, 1.0, 1.8],
      },
    ],
  },
  {
    id: 'Red',
    name: 'Red Line',
    color: '#E21F26',
    routes: [
      {
        towards: ['Rithala', 'Shaheed Sthal (New Bus Adda)'],
        stations: [
          'Inderlok', 'Shastri Nagar', 'Pratap Nagar', 'Pul Bangash', 'Tis Hazari', 'Kashmere Gate',
          'Shastri Park', 'Seelampur', 'Welcome',
        ],
        km: [1.2, 1.7, 0.8, 0.9, 1.1, 2.2, 1.6, 1.1],
      },
    ],
  },
  {
    id: 'Blue',
    name: 'Blue Line',
    color: '#0066B3',
    routes: [
      {
        towards: ['Dwarka Sector 21', 'Noida Electronic City'],
        stations: [
          'Kirti Nagar', 'Shadipur', 'Patel Nagar', 'Rajendra Place', 'Karol Bagh', 'Jhandewalan',
          'Ramakrishna Ashram Marg', 'Rajiv Chowk', 'Barakhamba Road', 'Mandi House', 'Supreme Court',
          'Indraprastha', 'Yamuna Bank',
        ],
        km: [0.9, 1.3, 0.9, 1.0, 1.2, 0.8, 1.0, 0.7, 1.0, 0.8, 0.8, 1.8],
      },
    ],
  },
  {
    id: 'Violet',
    name: 'Violet Line',
    color: '#7E3F98',
    routes: [
      {
        towards: ['Kashmere Gate', 'Raja Nahar Singh (Ballabhgarh)'],
        stations: [
          'Kashmere Gate', 'Lal Qila', 'Jama Masjid', 'Delhi Gate', 'ITO', 'Mandi House', 'Janpath',
          'Central Secretariat', 'Khan Market', 'JLN Stadium', 'Jangpura', 'Lajpat Nagar',
        ],
        km: [1.5, 0.8, 1.4, 1.3, 0.8, 1.4, 1.3, 2.1, 1.4, 0.9, 1.4],
      },
    ],
  },
  {
    id: 'Green',
    name: 'Green Line',
    color: '#00A650',
    // The Green Line is a Y: Inderlok and Kirti Nagar branches meet at Ashok Park Main.
    routes: [
      {
        towards: ['Inderlok', 'Brigadier Hoshiyar Singh'],
        stations: ['Inderlok', 'Ashok Park Main', 'Punjabi Bagh', 'Shivaji Park', 'Madipur'],
        km: [1.4, 1.0, 1.6, 1.0],
      },
      {
        towards: ['Kirti Nagar', 'Brigadier Hoshiyar Singh'],
        stations: ['Kirti Nagar', 'Satguru Ram Singh Marg', 'Ashok Park Main', 'Punjabi Bagh', 'Shivaji Park', 'Madipur'],
        km: [1.3, 1.0, 1.0, 1.6, 1.0],
      },
    ],
  },
];

export const STATIONS: StationDef[] = [
  // Yellow (north → south), x = 580
  { id: 'Jahangirpuri', x: 580, y: 40, label: 'r' },
  { id: 'Adarsh Nagar', x: 580, y: 70, label: 'r' },
  { id: 'Azadpur', x: 580, y: 100, label: 'r', otherLines: ['Pink'] },
  { id: 'Model Town', x: 580, y: 130, label: 'r' },
  { id: 'GTB Nagar', x: 580, y: 160, label: 'r', aliases: ['Guru Tegh Bahadur Nagar'] },
  { id: 'Vishwavidyalaya', x: 580, y: 190, label: 'r' },
  { id: 'Vidhan Sabha', x: 580, y: 220, label: 'r' },
  { id: 'Civil Lines', x: 580, y: 250, label: 'r' },
  { id: 'Kashmere Gate', x: 580, y: 290, label: 'l' },
  { id: 'Chandni Chowk', x: 580, y: 325, label: 'l' },
  { id: 'Chawri Bazar', x: 580, y: 355, label: 'l' },
  { id: 'New Delhi', x: 580, y: 385, label: 'l', otherLines: ['Airport Express'] },
  { id: 'Rajiv Chowk', x: 580, y: 420, label: 'b' },
  { id: 'Patel Chowk', x: 580, y: 455, label: 'l' },
  { id: 'Central Secretariat', x: 580, y: 490, label: 'l' },
  { id: 'Udyog Bhawan', x: 580, y: 520, label: 'l' },
  { id: 'Lok Kalyan Marg', x: 580, y: 550, label: 'l', aliases: ['Race Course'] },
  { id: 'Jor Bagh', x: 580, y: 580, label: 'l' },
  { id: 'INA', x: 580, y: 610, label: 'l', aliases: ['Dilli Haat INA', 'Dilli Haat - INA'], otherLines: ['Pink'] },
  { id: 'AIIMS', x: 580, y: 640, label: 'l' },
  { id: 'Green Park', x: 580, y: 670, label: 'l' },
  { id: 'Hauz Khas', x: 580, y: 700, label: 'l', otherLines: ['Magenta'] },
  // Red (west → east), y = 290
  { id: 'Inderlok', x: 280, y: 290, label: 't' },
  { id: 'Shastri Nagar', x: 340, y: 290, label: 'b' },
  { id: 'Pratap Nagar', x: 400, y: 290, label: 't' },
  { id: 'Pul Bangash', x: 460, y: 290, label: 'b' },
  { id: 'Tis Hazari', x: 520, y: 290, label: 't' },
  { id: 'Shastri Park', x: 670, y: 290, label: 't' },
  { id: 'Seelampur', x: 740, y: 290, label: 't' },
  { id: 'Welcome', x: 810, y: 290, label: 't', otherLines: ['Pink'] },
  // Blue (west → east), y = 420
  { id: 'Kirti Nagar', x: 160, y: 420, label: 'b' },
  { id: 'Shadipur', x: 220, y: 420, label: 't' },
  { id: 'Patel Nagar', x: 280, y: 420, label: 'b' },
  { id: 'Rajendra Place', x: 340, y: 420, label: 't' },
  { id: 'Karol Bagh', x: 400, y: 420, label: 'b' },
  { id: 'Jhandewalan', x: 460, y: 420, label: 't' },
  { id: 'Ramakrishna Ashram Marg', x: 520, y: 420, label: 'b', aliases: ['RK Ashram Marg', 'R K Ashram Marg'] },
  { id: 'Barakhamba Road', x: 660, y: 420, label: 'b' },
  { id: 'Supreme Court', x: 810, y: 420, label: 't', aliases: ['Pragati Maidan'] },
  { id: 'Indraprastha', x: 870, y: 420, label: 'b' },
  { id: 'Yamuna Bank', x: 930, y: 420, label: 't' },
  // Violet (Kashmere Gate → south-east)
  { id: 'Lal Qila', x: 630, y: 312, label: 'r', aliases: ['Red Fort'] },
  { id: 'Jama Masjid', x: 675, y: 334, label: 'r' },
  { id: 'Delhi Gate', x: 710, y: 358, label: 'r' },
  { id: 'ITO', x: 735, y: 388, label: 'r' },
  { id: 'Mandi House', x: 740, y: 420, label: 'b' },
  { id: 'Janpath', x: 690, y: 462, label: 'r' },
  { id: 'Khan Market', x: 640, y: 550, label: 'r' },
  { id: 'JLN Stadium', x: 690, y: 590, label: 'r', aliases: ['Jawaharlal Nehru Stadium'] },
  { id: 'Jangpura', x: 740, y: 630, label: 'r' },
  { id: 'Lajpat Nagar', x: 790, y: 670, label: 'r', otherLines: ['Pink'] },
  // Green (Inderlok / Kirti Nagar → west)
  { id: 'Ashok Park Main', x: 230, y: 340, label: 'r' },
  { id: 'Punjabi Bagh', x: 170, y: 340, label: 't' },
  { id: 'Shivaji Park', x: 110, y: 340, label: 'b' },
  { id: 'Madipur', x: 50, y: 340, label: 't' },
  { id: 'Satguru Ram Singh Marg', x: 195, y: 380, label: 'r' },
];

/** Minutes to walk between platforms and wait for the next train at an interchange. */
export const INTERCHANGE_MIN = 5;

/** Running time model: ~1.5 min per km plus ~0.6 min dwell, rounded, minimum 1 minute. */
export const hopMinutes = (km: number) => Math.max(1, Math.round(0.6 + km * 1.5));

/** DMRC fare slabs (₹), normal days, by shortest-path distance. */
export const FARE_SLABS: { uptoKm: number; fare: number }[] = [
  { uptoKm: 2, fare: 11 },
  { uptoKm: 5, fare: 21 },
  { uptoKm: 12, fare: 32 },
  { uptoKm: 21, fare: 43 },
  { uptoKm: 32, fare: 54 },
  { uptoKm: Infinity, fare: 64 },
];

export const fareFor = (km: number) => FARE_SLABS.find((s) => km <= s.uptoKm)!.fare;
