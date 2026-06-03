/* Maps US state abbreviations → HHS region number (1-10) for CDC FluView queries */
export const STATE_TO_HHS = {
  CT:1, ME:1, MA:1, NH:1, RI:1, VT:1,
  NJ:2, NY:2,
  DE:3, DC:3, MD:3, PA:3, VA:3, WV:3,
  AL:4, FL:4, GA:4, KY:4, MS:4, NC:4, SC:4, TN:4,
  IL:5, IN:5, MI:5, MN:5, OH:5, WI:5,
  AR:6, LA:6, NM:6, OK:6, TX:6,
  IA:7, KS:7, MO:7, NE:7,
  CO:8, MT:8, ND:8, SD:8, UT:8, WY:8,
  AZ:9, CA:9, HI:9, NV:9,
  AK:10, ID:10, OR:10, WA:10,
};

/* Maps US state full names → abbreviation */
export const STATE_NAME_TO_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','District of Columbia':'DC',
  'Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL',
  'Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA',
  'Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN',
  'Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
  'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
  'North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR',
  'Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',
  'Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA',
  'Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
};
