/* globals alert, $, Papa, Highcharts */

// indexes into csv arrays
var NAME = 0;
var SUCCESS = 1;
var FUNCTION = 2;
var HZ = 3;
var RME = 4;
var SAMPLES = 5;

var SERIES_HEIGHT = 40;
var MARGIN_RIGHT = 100;

var TWO_BUILDS = /(\d+):(\d+)/;

var SERIES_PRETTY_NAME = {
  parse: 'Parse',
  load:  'Load',
  eval:  'Eval',
  all:   'All'
};

var SERIES_HEIGHT_FACTOR = {
  4: 1.25,
  5: 1.75,
  6: 2.25
};

var symLinks = {
  'ast.arr': '../../../src/arr/trove/ast.arr',
  'anf-loop-compiler.arr': '../../../src/arr/compiler/anf-loop-compiler.arr'
};

var githubFilePrefix = 'https://github.com/brownplt/pyret-lang/tree/master' + 
  '/tools/benchmark/auto-report-programs/';

var rawGithubFilePrefix = 'https://raw.githubusercontent.com/brownplt/' + 
  'pyret-lang/master/tools/benchmark/auto-report-programs/';


function alertError (build) {
  alert('Error loading build ' + build +
    '. It may not exist, or it hasn\'t synced over. Check the Jenkins server for build errors!');
}

function visualize (build, normalized, sortByFileSize) {
  var twoBuilds = build.match(TWO_BUILDS);
  var getErrorPlaceHolder = $.Deferred();

  var jenkinsHref;
  var csvHref;

  if(twoBuilds) {
    var build0 = parseInt(twoBuilds[1]);
    var build1 = parseInt(twoBuilds[2]);


    var filename0 = 'auto-report-' + build0 + '.csv';
    var filename1 = 'auto-report-' + build1 + '.csv';
    jenkinsHref = 'http://mainmast.cs.brown.edu/job/pyret-benchmark/' + build0;
    csvHref = 'builds/' + filename0;

    $('#jenkins-nav').attr('href', jenkinsHref);
    $('#csv-download').attr('href', csvHref);

    var csvHref0 = csvHref;
    var csvHref1 = 'builds/' + filename1;

    return $.ajax({
      type: 'GET',
      url: csvHref0,
      dataType: 'text',
      success: function (data0) {
        return $.ajax({
          type: 'GET',
          url: csvHref1,
          dataType: 'text',
          success: function (data1) {
            makeDiffChart(Papa.parse(data0), Papa.parse(data1), filename0, filename1);
          }
        });
      }
    }); 
  } else {
    var filename = 'auto-report-' + build + '.csv';
    jenkinsHref = 'http://mainmast.cs.brown.edu/job/pyret-benchmark/' + build;
    csvHref = 'builds/' + filename;

    $('#jenkins-nav').attr('href', jenkinsHref);
    $('#csv-download').attr('href', csvHref);

    return $.ajax({
      type: 'GET',
      url: csvHref,
      dataType: 'text',
      success: function (data) {
        makeChart(Papa.parse(data), build, normalized, sortByFileSize);
      }
    });  
  }
}

function visualizeFromSource (src, filename) {
  makeChart(Papa.parse(src), 0, false, false, true, filename);
}

function visualizeDiffFromSource (src0, src1, filename0, filename1) {
  makeDiffChart(Papa.parse(src0), Papa.parse(src1), filename0, filename1);
}

function showIndexPage () {
  $('#choose-build').toggle(true);
  $('#choose-file').toggle(true);
  $('#choose-two-files').toggle(true);
  $('#rss-container').toggle(true);
  $('#rss-feeds').rss('http://mainmast.cs.brown.edu/job/pyret-benchmark/rssAll/index.xml', {
    limit: 150
  });
}

// returns promise that resolves with
// a hash mapping program names to file sizes
function getAllProgramSizes (names) {
  var sizeOf = {};
  var defer = $.Deferred();  
  // names.push('sdkfabsdfasdf');
  var promises = names.map(function (name) {
    return getProgramSize(name, sizeOf);
  });

  // if even one promise fails, then fail is called.
  // resolve anyway - we handle errors in getProgramSize
  $.when.apply($, promises).then(function () {
    defer.resolve(sizeOf);
  }).fail(function () {
    defer.resolve(sizeOf);
  });

  return defer.promise();
}

// returns promise
function getProgramSize (name, updateThisHash) {
  var fileToGet = symLinks[name] || name;
  var fileHref = rawGithubFilePrefix + fileToGet;
  return $.ajax({
    type: 'GET',
    url: fileHref,
    dataType: 'text',
    success: function (response) {
      updateThisHash[name] = response.length;
    },
    error: function (response) {
      //console.error('Could not load ' + name + '; setting "length" to Infinity.');
      updateThisHash[name] = Number.POSITIVE_INFINITY;
    }
  });
}

// this function sorts names and seriesData in place
// in place
function sortData (sizeOf, names, seriesData, seriesNames) {
  var bundled = [];
  var i;
  for (i = names.length - 1; i >= 0; i--) {
    bundled[i] = {
      'name': names[i],
      'size': sizeOf[names[i]],
      'series': seriesDataGetByIndex(seriesData, seriesNames, i)
    };
  }

  bundled = bundled.sort(function (a, b) {
    if (a.size < b.size) {
      return -1;
    }
    if (a.size > b.size) {
      return 1;
    }
    return 0;
  });
  
  for (i = bundled.length - 1; i >= 0; i--) {
    seriesDataSetByIndex(seriesData, seriesNames, i, bundled[i].series);
    names[i] = bundled[i].name;
  }
}

function seriesDataGetByIndex (seriesData, seriesNames, index) {
  var out = {};
  for (var i = 0; i < seriesNames.length; i++) {
    out[seriesNames[i]] = seriesData[seriesNames[i]][index];
  }
  return out;
}

function seriesDataSetByIndex (seriesData, seriesNames, index, setTo) {
  var out = {};
  for (var i = 0; i < seriesNames.length; i++) {
    seriesData[seriesNames[i]][index] = setTo[seriesNames[i]];
  }
  return out;
}

function get_hz (datum) {
  return datum[HZ];
}

function formatHzValue (hz) {
  return Math.round(parseFloat(hz) * 1000) / 1000;
}

function formatPercent (numer, denom) {
  return Math.round((numer / denom) * 10000) / 100;
}

function getSeriesNames (data) {
  var firstName = data[0][NAME];
  var relevantData = data.filter(function (datum) {
    return datum[NAME] === firstName;
  });
  var seriesNames = relevantData.map(function (datum) {
    return datum[FUNCTION];
  });
  return seriesNames;
}

function makeChart (csvParsed, build, normalized, sortByFileSize, fromSource, filename) {
  var data = csvParsed.data;

  data = data.filter(function (datum) {
    return datum[SUCCESS] === 'true'; 
  });

  var names = data.map(function (datum) {
    return datum[NAME];
  });

  var seriesNames = getSeriesNames(data);
  
  var NUMBER_OF_SERIES = seriesNames.length;

  if (names.length % 3 !== 0) {
    throw new Error('Corrupted CSV data!');
  }

  var i = 0;
  var names_set = [];
  while (i < names.length) {
    names_set[i / NUMBER_OF_SERIES] = names[i];
    i = i + NUMBER_OF_SERIES;
  }

  var seriesData = {};

  var seriesFilter = function (thisSeriesName) {
    return function (datum) {
      return datum[FUNCTION] === thisSeriesName;
    };
  };

  var seriesHzFormat = function (thisSeriesName) {
    return function (hz) {
      return normalized ?
        formatPercent(hz, seriesData[thisSeriesName][0]) :
        formatHzValue(hz);
    };
  };

  for (i = 0; i < seriesNames.length; i++) {
    seriesData[seriesNames[i]] = 
      data.filter(seriesFilter(seriesNames[i])).map(get_hz);
  }

  for (i = 0; i < seriesNames.length; i++) {
    seriesData[seriesNames[i]] = 
      seriesData[seriesNames[i]].map(seriesHzFormat(seriesNames[i]));
  }

  var chartSeries = seriesNames.map(function (thisSeriesName) {
    return {
      name: SERIES_PRETTY_NAME[thisSeriesName] || thisSeriesName,
      data: seriesData[thisSeriesName],
    };
  }).reverse();

  var config = {
    series: chartSeries,
    names: names_set,
    heightFactor: SERIES_HEIGHT_FACTOR[chartSeries.length] || 1,
    files: [filename],
    subtitle: fromSource ?
            'File: ' + filename :
            'Build ' + build + (normalized ? ': Normalized' : ': Raw Hertz'),
    xAxisText: '',
    yAxisText: normalized ? 'percent' : 'Hertz (ops/second)'
  };

  if (sortByFileSize) {
    getAllProgramSizes(names_set).done(function (response) {
      sortData(response, names_set, seriesData, seriesNames);
      config.chartSeries = seriesNames.map(function (thisSeriesName) {
        return {
          name: SERIES_PRETTY_NAME[thisSeriesName] || thisSeriesName,
          data: seriesData[thisSeriesName],
        };
      }).reverse();

      showChart(config);
    });
  } else {
    showChart(config);
  }
}

function getRangeSliceByName (rangeParsed, index, name) {
  return rangeParsed.map(function (buildData) {
    return buildData.filter(
      function (datum) {
        return datum[index] === name;
      }); 
  });
}

function getFileViewOfSlice (slice, fileIndex) {
  return slice.map(function (sliceData) {
    return sliceData[fileIndex];
  });
}

function superError (msg) {
  alert(msg);
  throw new Error(msg);
}

function makeDiffChart (csv0, csv1, filename0, filename1) {

  var data0 = csv0.data;
  var data1 = csv1.data;

  data0 = data0.filter(function (datum) {
    return datum[SUCCESS] === 'true'; 
  });

  data1 = data1.filter(function (datum) {
    return datum[SUCCESS] === 'true'; 
  });

  var seriesNames0 = getSeriesNames(data0);
  var seriesNames1 = getSeriesNames(data1);
  if (seriesNames0.length !== seriesNames1.length) {
    superError("Data sets don't have the same number of series!");
    
  }
  var i;
  for (i = 0; i < seriesNames0.length; i++) {
    if (seriesNames0[i] !== seriesNames1[i]) {
      superError("Data sets have mismatching series!");
    }
  }

  var seriesNames = seriesNames0;

  var rangeParsed = [data0, data1];

  var seriesSlices = {};
  
  for (i = 0; i < seriesNames.length; i++) {
    seriesSlices[seriesNames[i]] = 
      getRangeSliceByName(rangeParsed, FUNCTION, seriesNames[i]);
  }

  // var sliceParse = getRangeSliceByName(rangeParsed, FUNCTION, 'parse');
  // var sliceLoad = getRangeSliceByName(rangeParsed, FUNCTION, 'load');
  // var sliceEval = getRangeSliceByName(rangeParsed, FUNCTION, 'eval');


  var names = data0.map(function (datum) {
    return datum[NAME];
  });

  // console.log(names);
  var NUMBER_OF_SERIES = seriesNames.length;

  if (names.length % NUMBER_OF_SERIES !== 0) {
    throw new Error('Corrupted CSV data!');
  }

  i = 0;
  var names_set = [];
  while (i < names.length) {
    names_set[i / NUMBER_OF_SERIES] = names[i];
    i = i + NUMBER_OF_SERIES;
  }

  function getFormatHz (datum) {
    return formatHzValue(get_hz(datum));
  }

  for (i = 0; i < seriesNames.length; i++) {
    seriesSlices[seriesNames[i]][0] = 
      seriesSlices[seriesNames[i]][0].map(getFormatHz);
    seriesSlices[seriesNames[i]][1] = 
      seriesSlices[seriesNames[i]][1].map(getFormatHz);
  }

  
  // var parse0 = sliceParse[0].map(getFormatHz);
  // var parse1 = sliceParse[1].map(getFormatHz);

  // var load0 = sliceLoad[0].map(getFormatHz);
  // var load1 = sliceLoad[1].map(getFormatHz);

  // var eval0 = sliceEval[0].map(getFormatHz);
  // var eval1 = sliceEval[1].map(getFormatHz);

  function filenameFormat (fn) {
    // remove .csv suffix
    return fn.slice(0, fn.length - 4);
  }

  var fn0 = filenameFormat(filename0);
  var fn1 = filenameFormat(filename1);

  var chartSeries = [];
  for (i = 0; i < seriesNames.length; i++) {
    chartSeries[2 * i] = {
      name: [SERIES_PRETTY_NAME[seriesNames[i]], fn0].join(' '),
      data: seriesSlices[seriesNames[i]][0]
    };
    chartSeries[(2 * i) + 1] = {
      name: [SERIES_PRETTY_NAME[seriesNames[i]], fn1].join(' '),
      data: seriesSlices[seriesNames[i]][1]
    };
  }

  chartSeries.reverse();

  var config = {
    series: chartSeries,
    names: names_set,
    heightFactor: 1,
    files: [filename0, filename1],
    subtitle: 'Files: ' + filename0 + ' & ' + filename1,
    xAxisText: '',
    yAxisText: 'Hertz (ops/second)'
  };


  showChart(config);
}

function showChart (config) {
  var unitHeight = SERIES_HEIGHT * config.series.length * config.heightFactor;
  var chartHeight = unitHeight * config.names.length;
  $(function () {
    $('#container').highcharts({
      chart: {
        type: 'bar',
        height: chartHeight,
        marginRight: MARGIN_RIGHT
      },
      title: {
        text: 'Pyret Benchmark'
      },
      subtitle: {
        text: config.subtitle
      },
      xAxis: {
        categories: config.names,
        title: {
          text: config.xAxisText
        },
        labels: {
          formatter: function () {
            var disp = this.value;
            return '<a href="' + githubFilePrefix + this.value +
              '" target="_blank">' + disp + '</a>';
          },
          useHTML: true
        }
      },
      yAxis: {
        min: 0,
        title: {
          text: config.yAxisText,
          align: 'high'
        },
        labels: {
          overflow: 'justify'
        },
        opposite: true
      },
      tooltip: {
        valueSuffix: ' hz'
      },
      plotOptions: {
        bar: {
          dataLabels: {
            enabled: true
          }
        },
        series: {
          pointWidth: 20    
        }
      },
      legend: {
        layout: 'vertical',
        align: 'left',
        verticalAlign: 'top',
        x: 30,
        y: 80,
        floating: true,
        borderWidth: 1,
        backgroundColor: ((Highcharts.theme && Highcharts.theme.legendBackgroundColor) || '#FFFFFF'),
        shadow: true,
        reversed: true
      },
      exporting: {
       enabled: true
     },
     credits: {
      enabled: true
    },
    series: config.series
  });
});
}