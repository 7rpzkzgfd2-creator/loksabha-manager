// State and UT reference data.
// Seat counts and constituency names follow the Delimitation of Parliamentary and
// Assembly Constituencies Order, 2008 (543 seats). Names were transcribed for the game
// and should be checked against ECI records before being cited anywhere.
// Socio-economic fields (urban, agri, income, turnout) are coarse game estimates,
// not official statistics.

import type { Issue } from '../types.ts';

export interface StateDef {
  code: string;
  name: string;
  region: 'North' | 'West' | 'Central' | 'East' | 'Northeast' | 'South';
  language: string;
  urban: number; // 0..1 estimate
  agri: number; // 0..1 dependence on agriculture, estimate
  income: number; // 0..1 relative, estimate
  turnout: number; // typical turnout, estimate
  issues: Partial<Record<Issue, number>>; // extra salience
  grid: [number, number, number]; // map anchor x, y, columns
  seats: string[];
}

const s = (list: string) => list.split(',').map((x) => x.trim());

export const STATES: StateDef[] = [
  { code: 'JK', name: 'Jammu & Kashmir', region: 'North', language: 'Kashmiri/Dogri', urban: 0.27, agri: 0.5, income: 0.45, turnout: 0.55, issues: { security: 0.4, federalism: 0.4, jobs: 0.2 }, grid: [21, 0, 3],
    seats: s('Baramulla, Srinagar, Anantnag, Udhampur, Jammu') },
  { code: 'LA', name: 'Ladakh', region: 'North', language: 'Ladakhi', urban: 0.3, agri: 0.4, income: 0.5, turnout: 0.71, issues: { federalism: 0.5, environment: 0.3 }, grid: [25, 0, 1],
    seats: s('Ladakh') },
  { code: 'HP', name: 'Himachal Pradesh', region: 'North', language: 'Hindi', urban: 0.1, agri: 0.6, income: 0.65, turnout: 0.7, issues: { jobs: 0.2, infrastructure: 0.2 }, grid: [24, 3, 2],
    seats: s('Kangra, Mandi, Hamirpur, Shimla') },
  { code: 'PB', name: 'Punjab', region: 'North', language: 'Punjabi', urban: 0.38, agri: 0.7, income: 0.62, turnout: 0.63, issues: { agriculture: 0.5, corruption: 0.2, federalism: 0.2 }, grid: [19, 3, 4],
    seats: s('Gurdaspur, Amritsar, Khadoor Sahib, Jalandhar, Hoshiarpur, Anandpur Sahib, Ludhiana, Fatehgarh Sahib, Faridkot, Ferozpur, Bathinda, Sangrur, Patiala') },
  { code: 'CH', name: 'Chandigarh', region: 'North', language: 'Hindi/Punjabi', urban: 0.97, agri: 0.05, income: 0.85, turnout: 0.67, issues: { infrastructure: 0.2 }, grid: [23, 6, 1],
    seats: s('Chandigarh') },
  { code: 'UK', name: 'Uttarakhand', region: 'North', language: 'Hindi', urban: 0.3, agri: 0.5, income: 0.6, turnout: 0.58, issues: { environment: 0.3, jobs: 0.3, security: 0.2 }, grid: [27, 5, 3],
    seats: s('Tehri Garhwal, Garhwal, Almora, Nainital-Udhamsingh Nagar, Haridwar') },
  { code: 'HR', name: 'Haryana', region: 'North', language: 'Hindi', urban: 0.35, agri: 0.6, income: 0.7, turnout: 0.65, issues: { agriculture: 0.4, jobs: 0.4 }, grid: [20, 8, 3],
    seats: s('Ambala, Kurukshetra, Sirsa, Hisar, Karnal, Sonipat, Rohtak, Bhiwani-Mahendragarh, Gurgaon, Faridabad') },
  { code: 'DL', name: 'NCT of Delhi', region: 'North', language: 'Hindi', urban: 0.97, agri: 0.02, income: 0.85, turnout: 0.58, issues: { inflation: 0.2, infrastructure: 0.3, environment: 0.3, corruption: 0.2 }, grid: [23, 8, 2],
    seats: s('Chandni Chowk, North East Delhi, East Delhi, New Delhi, North West Delhi, West Delhi, South Delhi') },
  { code: 'RJ', name: 'Rajasthan', region: 'West', language: 'Hindi/Rajasthani', urban: 0.25, agri: 0.6, income: 0.45, turnout: 0.62, issues: { agriculture: 0.2, jobs: 0.3, security: 0.2 }, grid: [12, 9, 6],
    seats: s('Ganganagar, Bikaner, Churu, Jhunjhunu, Sikar, Jaipur Rural, Jaipur, Alwar, Bharatpur, Karauli-Dholpur, Dausa, Tonk-Sawai Madhopur, Ajmer, Nagaur, Pali, Jodhpur, Barmer, Jalore, Udaipur, Banswara, Chittorgarh, Rajsamand, Bhilwara, Kota, Jhalawar-Baran') },
  { code: 'UP', name: 'Uttar Pradesh', region: 'North', language: 'Hindi', urban: 0.23, agri: 0.65, income: 0.3, turnout: 0.57, issues: { jobs: 0.3, identity: 0.3, welfare: 0.2, agriculture: 0.2 }, grid: [26, 9, 10],
    seats: s('Saharanpur, Kairana, Muzaffarnagar, Bijnor, Nagina, Moradabad, Rampur, Sambhal, Amroha, Meerut, Baghpat, Ghaziabad, Gautam Buddha Nagar, Bulandshahr, Aligarh, Hathras, Mathura, Agra, Fatehpur Sikri, Firozabad, Mainpuri, Etah, Badaun, Aonla, Bareilly, Pilibhit, Shahjahanpur, Kheri, Dhaurahra, Sitapur, Hardoi, Misrikh, Unnao, Mohanlalganj, Lucknow, Rae Bareli, Amethi, Sultanpur, Pratapgarh, Farrukhabad, Etawah, Kannauj, Kanpur, Akbarpur, Jalaun, Jhansi, Hamirpur, Banda, Fatehpur, Kaushambi, Phulpur, Allahabad, Barabanki, Faizabad, Ambedkar Nagar, Bahraich, Kaiserganj, Shrawasti, Gonda, Domariyaganj, Basti, Sant Kabir Nagar, Maharajganj, Gorakhpur, Kushi Nagar, Deoria, Bansgaon, Lalganj, Azamgarh, Ghosi, Salempur, Ballia, Jaunpur, Machhlishahr, Ghazipur, Chandauli, Varanasi, Bhadohi, Mirzapur, Robertsganj') },
  { code: 'BR', name: 'Bihar', region: 'East', language: 'Hindi/Maithili/Bhojpuri', urban: 0.12, agri: 0.75, income: 0.18, turnout: 0.56, issues: { jobs: 0.5, welfare: 0.3, identity: 0.2 }, grid: [37, 11, 8],
    seats: s('Valmiki Nagar, Paschim Champaran, Purvi Champaran, Sheohar, Sitamarhi, Madhubani, Jhanjharpur, Supaul, Araria, Kishanganj, Katihar, Purnia, Madhepura, Darbhanga, Muzaffarpur, Vaishali, Gopalganj, Siwan, Maharajganj, Saran, Hajipur, Ujiarpur, Samastipur, Begusarai, Khagaria, Bhagalpur, Banka, Munger, Nalanda, Patna Sahib, Pataliputra, Arrah, Buxar, Sasaram, Karakat, Jahanabad, Aurangabad, Gaya, Nawada, Jamui') },
  { code: 'SK', name: 'Sikkim', region: 'Northeast', language: 'Nepali', urban: 0.25, agri: 0.5, income: 0.75, turnout: 0.79, issues: { environment: 0.3, infrastructure: 0.3 }, grid: [45, 9, 1],
    seats: s('Sikkim') },
  { code: 'AR', name: 'Arunachal Pradesh', region: 'Northeast', language: 'Various', urban: 0.23, agri: 0.6, income: 0.55, turnout: 0.77, issues: { infrastructure: 0.4, security: 0.3 }, grid: [51, 8, 2],
    seats: s('Arunachal West, Arunachal East') },
  { code: 'AS', name: 'Assam', region: 'Northeast', language: 'Assamese/Bengali', urban: 0.14, agri: 0.65, income: 0.35, turnout: 0.8, issues: { identity: 0.4, infrastructure: 0.2, environment: 0.2 }, grid: [47, 10, 5],
    seats: s('Karimganj, Silchar, Autonomous District, Dhubri, Kokrajhar, Barpeta, Gauhati, Mangaldoi, Tezpur, Nowgong, Kaliabor, Jorhat, Dibrugarh, Lakhimpur') },
  { code: 'NL', name: 'Nagaland', region: 'Northeast', language: 'Various', urban: 0.29, agri: 0.6, income: 0.5, turnout: 0.57, issues: { federalism: 0.5, infrastructure: 0.3 }, grid: [53, 11, 1],
    seats: s('Nagaland') },
  { code: 'ML', name: 'Meghalaya', region: 'Northeast', language: 'Khasi/Garo', urban: 0.2, agri: 0.6, income: 0.45, turnout: 0.76, issues: { federalism: 0.3, infrastructure: 0.3 }, grid: [47, 13, 2],
    seats: s('Shillong, Tura') },
  { code: 'MN', name: 'Manipur', region: 'Northeast', language: 'Meitei/Various', urban: 0.3, agri: 0.5, income: 0.4, turnout: 0.78, issues: { security: 0.6, identity: 0.3 }, grid: [52, 13, 1],
    seats: s('Inner Manipur, Outer Manipur') },
  { code: 'TR', name: 'Tripura', region: 'Northeast', language: 'Bengali/Kokborok', urban: 0.26, agri: 0.5, income: 0.45, turnout: 0.8, issues: { jobs: 0.3, infrastructure: 0.2 }, grid: [49, 14, 1],
    seats: s('Tripura West, Tripura East') },
  { code: 'MZ', name: 'Mizoram', region: 'Northeast', language: 'Mizo', urban: 0.52, agri: 0.4, income: 0.55, turnout: 0.56, issues: { federalism: 0.4, security: 0.2 }, grid: [50, 15, 1],
    seats: s('Mizoram') },
  { code: 'GJ', name: 'Gujarat', region: 'West', language: 'Gujarati', urban: 0.43, agri: 0.45, income: 0.7, turnout: 0.6, issues: { economy: 0.3, infrastructure: 0.3 }, grid: [7, 15, 6],
    seats: s('Kachchh, Banaskantha, Patan, Mahesana, Sabarkantha, Gandhinagar, Ahmedabad East, Ahmedabad West, Surendranagar, Rajkot, Porbandar, Jamnagar, Junagadh, Amreli, Bhavnagar, Anand, Kheda, Panchmahal, Dahod, Vadodara, Chhota Udaipur, Bharuch, Bardoli, Surat, Navsari, Valsad') },
  { code: 'MP', name: 'Madhya Pradesh', region: 'Central', language: 'Hindi', urban: 0.28, agri: 0.65, income: 0.35, turnout: 0.66, issues: { agriculture: 0.3, welfare: 0.3 }, grid: [15, 15, 8],
    seats: s('Morena, Bhind, Gwalior, Guna, Sagar, Tikamgarh, Damoh, Khajuraho, Satna, Rewa, Sidhi, Shahdol, Jabalpur, Mandla, Balaghat, Chhindwara, Hoshangabad, Vidisha, Bhopal, Rajgarh, Dewas, Ujjain, Mandsaur, Ratlam, Dhar, Indore, Khargone, Khandwa, Betul') },
  { code: 'JH', name: 'Jharkhand', region: 'East', language: 'Hindi/Santali', urban: 0.24, agri: 0.55, income: 0.3, turnout: 0.66, issues: { identity: 0.3, jobs: 0.3, environment: 0.2 }, grid: [37, 17, 5],
    seats: s('Rajmahal, Dumka, Godda, Chatra, Kodarma, Giridih, Dhanbad, Ranchi, Jamshedpur, Singhbhum, Khunti, Lohardaga, Palamu, Hazaribagh') },
  { code: 'WB', name: 'West Bengal', region: 'East', language: 'Bengali', urban: 0.32, agri: 0.55, income: 0.4, turnout: 0.8, issues: { identity: 0.3, welfare: 0.3, federalism: 0.3 }, grid: [43, 17, 5],
    seats: s('Cooch Behar, Alipurduars, Jalpaiguri, Darjeeling, Raiganj, Balurghat, Maldaha Uttar, Maldaha Dakshin, Jangipur, Baharampur, Murshidabad, Krishnanagar, Ranaghat, Bangaon, Barrackpore, Dum Dum, Barasat, Basirhat, Jaynagar, Mathurapur, Diamond Harbour, Jadavpur, Kolkata Dakshin, Kolkata Uttar, Howrah, Uluberia, Sreerampur, Hooghly, Arambagh, Tamluk, Kanthi, Ghatal, Jhargram, Medinipur, Purulia, Bankura, Bishnupur, Bardhaman Purba, Bardhaman-Durgapur, Asansol, Bolpur, Birbhum') },
  { code: 'CG', name: 'Chhattisgarh', region: 'Central', language: 'Hindi/Chhattisgarhi', urban: 0.23, agri: 0.7, income: 0.35, turnout: 0.71, issues: { agriculture: 0.3, security: 0.2, welfare: 0.3 }, grid: [27, 19, 3],
    seats: s('Sarguja, Raigarh, Janjgir-Champa, Korba, Bilaspur, Rajnandgaon, Durg, Raipur, Mahasamund, Bastar, Kanker') },
  { code: 'DN', name: 'Dadra & Nagar Haveli', region: 'West', language: 'Gujarati', urban: 0.47, agri: 0.3, income: 0.6, turnout: 0.7, issues: { jobs: 0.2 }, grid: [6, 21, 1],
    seats: s('Dadra and Nagar Haveli') },
  { code: 'DD', name: 'Daman & Diu', region: 'West', language: 'Gujarati', urban: 0.75, agri: 0.1, income: 0.65, turnout: 0.68, issues: { jobs: 0.2 }, grid: [6, 22, 1],
    seats: s('Daman and Diu') },
  { code: 'OD', name: 'Odisha', region: 'East', language: 'Odia', urban: 0.17, agri: 0.6, income: 0.35, turnout: 0.74, issues: { welfare: 0.3, identity: 0.2, environment: 0.2 }, grid: [31, 20, 5],
    seats: s('Bargarh, Sundargarh, Sambalpur, Keonjhar, Mayurbhanj, Balasore, Bhadrak, Jajpur, Dhenkanal, Bolangir, Kalahandi, Nabarangpur, Kandhamal, Cuttack, Kendrapara, Jagatsinghpur, Puri, Bhubaneswar, Aska, Berhampur, Koraput') },
  { code: 'MH', name: 'Maharashtra', region: 'West', language: 'Marathi', urban: 0.45, agri: 0.5, income: 0.68, turnout: 0.61, issues: { agriculture: 0.3, identity: 0.2, jobs: 0.2, federalism: 0.2 }, grid: [10, 21, 8],
    seats: s('Nandurbar, Dhule, Jalgaon, Raver, Buldhana, Akola, Amravati, Wardha, Ramtek, Nagpur, Bhandara-Gondiya, Gadchiroli-Chimur, Chandrapur, Yavatmal-Washim, Hingoli, Nanded, Parbhani, Jalna, Aurangabad, Dindori, Nashik, Palghar, Bhiwandi, Kalyan, Thane, Mumbai North, Mumbai North West, Mumbai North East, Mumbai North Central, Mumbai South Central, Mumbai South, Raigad, Maval, Pune, Baramati, Shirur, Ahmednagar, Shirdi, Beed, Osmanabad, Latur, Solapur, Madha, Sangli, Satara, Ratnagiri-Sindhudurg, Kolhapur, Hatkanangle') },
  { code: 'TG', name: 'Telangana', region: 'South', language: 'Telugu', urban: 0.39, agri: 0.5, income: 0.65, turnout: 0.66, issues: { welfare: 0.3, jobs: 0.3, federalism: 0.2 }, grid: [19, 27, 5],
    seats: s('Adilabad, Peddapalle, Karimnagar, Nizamabad, Zahirabad, Medak, Malkajgiri, Secunderabad, Hyderabad, Chevella, Mahbubnagar, Nagarkurnool, Nalgonda, Bhongir, Warangal, Mahabubabad, Khammam') },
  { code: 'GA', name: 'Goa', region: 'West', language: 'Konkani', urban: 0.62, agri: 0.2, income: 0.85, turnout: 0.76, issues: { environment: 0.4, jobs: 0.2 }, grid: [9, 28, 1],
    seats: s('North Goa, South Goa') },
  { code: 'KA', name: 'Karnataka', region: 'South', language: 'Kannada', urban: 0.39, agri: 0.5, income: 0.65, turnout: 0.69, issues: { federalism: 0.2, infrastructure: 0.3, agriculture: 0.2 }, grid: [11, 28, 6],
    seats: s('Chikkodi, Belgaum, Bagalkot, Bijapur, Gulbarga, Raichur, Bidar, Koppal, Bellary, Haveri, Dharwad, Uttara Kannada, Davanagere, Shimoga, Udupi Chikmagalur, Hassan, Dakshina Kannada, Chitradurga, Tumkur, Mandya, Mysore, Chamarajanagar, Bangalore Rural, Bangalore North, Bangalore Central, Bangalore South, Chikballapur, Kolar') },
  { code: 'AP', name: 'Andhra Pradesh', region: 'South', language: 'Telugu', urban: 0.3, agri: 0.6, income: 0.55, turnout: 0.8, issues: { welfare: 0.4, federalism: 0.3, infrastructure: 0.2 }, grid: [18, 32, 6],
    seats: s('Araku, Srikakulam, Vizianagaram, Visakhapatnam, Anakapalli, Kakinada, Amalapuram, Rajahmundry, Narsapuram, Eluru, Machilipatnam, Vijayawada, Guntur, Narasaraopet, Bapatla, Ongole, Nandyal, Kurnool, Anantapur, Hindupur, Kadapa, Nellore, Tirupati, Rajampet, Chittoor') },
  { code: 'KL', name: 'Kerala', region: 'South', language: 'Malayalam', urban: 0.48, agri: 0.3, income: 0.7, turnout: 0.72, issues: { health_edu: 0.4, jobs: 0.3, federalism: 0.2 }, grid: [11, 34, 3],
    seats: s('Kasaragod, Kannur, Vadakara, Wayanad, Kozhikode, Malappuram, Ponnani, Palakkad, Alathur, Thrissur, Chalakudy, Ernakulam, Idukki, Kottayam, Alappuzha, Mavelikkara, Pathanamthitta, Kollam, Attingal, Thiruvananthapuram') },
  { code: 'TN', name: 'Tamil Nadu', region: 'South', language: 'Tamil', urban: 0.48, agri: 0.4, income: 0.68, turnout: 0.7, issues: { federalism: 0.5, welfare: 0.3, health_edu: 0.2 }, grid: [15, 38, 6],
    seats: s('Thiruvallur, Chennai North, Chennai South, Chennai Central, Sriperumbudur, Kancheepuram, Arakkonam, Vellore, Krishnagiri, Dharmapuri, Tiruvannamalai, Arani, Viluppuram, Kallakurichi, Salem, Namakkal, Erode, Tiruppur, Nilgiris, Coimbatore, Pollachi, Dindigul, Karur, Tiruchirappalli, Perambalur, Cuddalore, Chidambaram, Mayiladuthurai, Nagapattinam, Thanjavur, Sivaganga, Madurai, Theni, Virudhunagar, Ramanathapuram, Thoothukudi, Tenkasi, Tirunelveli, Kanniyakumari') },
  { code: 'PY', name: 'Puducherry', region: 'South', language: 'Tamil', urban: 0.68, agri: 0.2, income: 0.65, turnout: 0.78, issues: { federalism: 0.3 }, grid: [22, 37, 1],
    seats: s('Puducherry') },
  { code: 'LD', name: 'Lakshadweep', region: 'South', language: 'Malayalam', urban: 0.78, agri: 0.1, income: 0.5, turnout: 0.84, issues: { environment: 0.4, federalism: 0.3 }, grid: [7, 36, 1],
    seats: s('Lakshadweep') },
  { code: 'AN', name: 'Andaman & Nicobar', region: 'East', language: 'Hindi/Bengali', urban: 0.38, agri: 0.3, income: 0.6, turnout: 0.64, issues: { environment: 0.3, infrastructure: 0.3 }, grid: [33, 32, 1],
    seats: s('Andaman and Nicobar Islands') },
];

// Seats treated as predominantly urban (big metros and large cities). Used for the
// urbanisation estimate only.
export const URBAN_SEATS = new Set(s(
  'Chandni Chowk, North East Delhi, East Delhi, New Delhi, North West Delhi, West Delhi, South Delhi, Mumbai North, Mumbai North West, Mumbai North East, Mumbai North Central, Mumbai South Central, Mumbai South, Thane, Kalyan, Pune, Nagpur, Bangalore North, Bangalore Central, Bangalore South, Chennai North, Chennai South, Chennai Central, Kolkata Dakshin, Kolkata Uttar, Howrah, Dum Dum, Barrackpore, Jadavpur, Hyderabad, Secunderabad, Malkajgiri, Ahmedabad East, Ahmedabad West, Surat, Vadodara, Rajkot, Jaipur, Lucknow, Kanpur, Ghaziabad, Gautam Buddha Nagar, Indore, Bhopal, Patna Sahib, Ranchi, Jamshedpur, Dhanbad, Bhubaneswar, Visakhapatnam, Vijayawada, Coimbatore, Madurai, Ernakulam, Thiruvananthapuram, Gurgaon, Faridabad, Ludhiana, Amritsar, Chandigarh, Gauhati, Agra, Varanasi, Allahabad, Meerut, Asansol, Mysore, Kozhikode'
));
