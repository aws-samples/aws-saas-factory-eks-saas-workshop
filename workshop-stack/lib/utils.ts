const getTimeString = () => {
  const date = new Date();
  var yyyy = date.getFullYear().toString();
  var MM = pad(date.getMonth() + 1, 2);
  var dd = pad(date.getDate(), 2);
  var hh = pad(date.getHours(), 2);
  var mm = pad(date.getMinutes(), 2);
  var ss = pad(date.getSeconds(), 2);
  return yyyy + MM + dd + hh + mm + ss;
};

const pad = (n: number, l: number) => {
  var str = '' + n;
  while (str.length < l) {
    str = '0' + str;
  }
  return str;
};

export default getTimeString;
