/* globals alert, $, Papa, Highcharts */

// indexes into csv arrays
var NAME = 0;
var SUCCESS = 1;
var FUNCTION = 2;
var HZ = 3;
var RME = 4;
var SAMPLES = 5;

var CATEGORY_HEIGHT = 120;
var MARGIN_RIGHT = 100;

var RANGE_REGEX = /(\d+):(\d+)/;

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
  var matchRange = build.match(RANGE_REGEX);
  var getErrorPlaceHolder = $.Deferred();

  var jenkinsHref;
  var csvHref;

  if(matchRange) {
    var build0 = parseInt(matchRange[1]);
    var build1 = parseInt(matchRange[2]);


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

// this function sorts names, parseData, loadData, and evalData 
// in place
function sortData (sizeOf, names, parseData, loadData, evalData) {
  var bundled = [];
  var i;
  for (i = names.length - 1; i >= 0; i--) {
    bundled[i] = {
      'name': names[i],
      'size': sizeOf[names[i]],
      'parse': parseData[i],
      'load': loadData[i],
      'eval': evalData[i]
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
    parseData[i] = bundled[i].parse;
    loadData[i] = bundled[i].load;
    evalData[i] = bundled[i].eval;
    names[i] = bundled[i].name;
  }
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

function makeChart (csvParsed, build, normalized, sortByFileSize, fromSource, filename) {
  var data = csvParsed.data;

  data = data.filter(function (datum) {
    return datum[SUCCESS] === 'true'; 
  });

  var names = data.map(function (datum) {
    return datum[NAME];
  });

  if (names.length % 3 !== 0) {
    throw new Error('Corrupted CSV data!');
  }

  /* names are in triplicate because of parse, load, and eval */
  var i = 0;
  var names_set = [];
  while (i < names.length) {
    names_set[i / 3] = names[i];
    i = i + 3;
  }

  var parseData = data.filter(function (datum) {
    return datum[FUNCTION] === 'parse';
  }).map(get_hz);

  var loadData = data.filter(function (datum) {
    return datum[FUNCTION] === 'load';
  }).map(get_hz);

  var evalData = data.filter(function (datum) {
    return datum[FUNCTION] === 'eval';
  }).map(get_hz);

  if (normalized) {
    var parseGold = parseData[0];
    var loadGold = loadData[0];
    var evalGold = evalData[0];

    parseData = parseData.map(function (hz) {
      return formatPercent(hz, parseGold);
    });
    loadData  = loadData.map(function (hz) {
      return formatPercent(hz, loadGold);
    });
    evalData  = evalData.map(function (hz) {
      return formatPercent(hz, evalGold);
    });
  } else {
    parseData = parseData.map(formatHzValue);
    loadData = loadData.map(formatHzValue);
    evalData = evalData.map(formatHzValue);
  }

  if (sortByFileSize) {
    getAllProgramSizes(names_set).done(function (response) {
      sortData(response, names_set, parseData, loadData, evalData, 'size');
    });
  }

  var config = {
    series: [
      {
        name: 'Parse',
        data: parseData,
        index: 2
      }, {
        name: 'Load',
        data: loadData,
        index: 1
      }, {
        name: 'Eval',
        data: evalData,
        index: 0
      }
    ],
    names: names_set,
    heightFactor: 1,
    files: [filename],
    subtitle: fromSource ?
            'File: ' + filename :
            'Build ' + build + (normalized ? ': Normalized' : ': Raw Hertz'),
    xAxisText: '',
    yAxisText: normalized ? 'percent' : 'Hertz (ops/second)'
  };

  showChart(config);
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

function makeDiffChart (csv0, csv1, filename0, filename1) {

  var data0 = csv0.data;
  var data1 = csv1.data;

  data0 = data0.filter(function (datum) {
    return datum[SUCCESS] === 'true'; 
  });

  data1 = data1.filter(function (datum) {
    return datum[SUCCESS] === 'true'; 
  });

  var rangeParsed = [data0, data1];

  var sliceParse = getRangeSliceByName(rangeParsed, FUNCTION, 'parse');
  var sliceLoad = getRangeSliceByName(rangeParsed, FUNCTION, 'load');
  var sliceEval = getRangeSliceByName(rangeParsed, FUNCTION, 'eval');


  var names = data0.map(function (datum) {
    return datum[NAME];
  });

  // console.log(names);

  if (names.length % 3 !== 0) {
    throw new Error('Corrupted CSV data!');
  }

  /* names are in triplicate because of parse, load, and eval */
  var i = 0;
  var names_set = [];
  while (i < names.length) {
    names_set[i / 3] = names[i];
    i = i + 3;
  }

  function getFormatHz (datum) {
    return formatHzValue(get_hz(datum));
  }

  
  var parse0 = sliceParse[0].map(getFormatHz);
  var parse1 = sliceParse[1].map(getFormatHz);

  var load0 = sliceLoad[0].map(getFormatHz);
  var load1 = sliceLoad[1].map(getFormatHz);

  var eval0 = sliceEval[0].map(getFormatHz);
  var eval1 = sliceEval[1].map(getFormatHz);

  function filenameFormat (fn) {
    // remove .csv suffix
    return fn.slice(0, fn.length - 4);
  }

  var fn0 = filenameFormat(filename0);
  var fn1 = filenameFormat(filename1);

  var config = {
    series: [
      {
        name: 'Eval ' + fn1,
        data: eval1,
      },
      {
        name: 'Eval ' + fn0,
        data: eval0,
      },
      {
        name: 'Load ' + fn1,
        data: load1,
      },
      {
        name: 'Load ' + fn0,
        data: load0,
      },
      {
        name: 'Parse ' + fn1,
        data: parse1,
      },
      {
        name: 'Parse ' + fn0,
        data: parse0,
      }
    ],
    names: names_set,
    heightFactor: 2.5,
    files: [filename0, filename1],
    subtitle: 'Files: ' + filename0 + ' & ' + filename1,
    xAxisText: '',
    yAxisText: 'Hertz (ops/second)'
  };


  showChart(config);
}

function makeRangeChart (rangeParsed, start, end, normalized, sortByFileSize) {
  var FILE_INDEX = 14;
  // console.log(rangeParsed);
  var parseSlice = getRangeSliceByName(rangeParsed, FUNCTION, 'eval');
  // console.log(parseSlice);
  var testFileParseSlice = getFileViewOfSlice(parseSlice, FILE_INDEX);
  // console.log(testFileParseSlice);

  var hzSlice = testFileParseSlice.map(function (datum) {
    return formatHzValue(get_hz(datum));
  });

  var range = [];
  var i = 0, count = start;
  while (count <= end) {
    range[i] = count;
    i++;
    count++;
  }
  
  $(function () {
    $('#container').highcharts({
      chart: {
        zoomType: 'x'
      },
      title: {
        text: 'Eval Speed of ' + testFileParseSlice[0][0]
      },
      xAxis: {
        title: {
          text: 'Jenkins Build Number'
        },
        categories: range
      },
      yAxis: {
        title: {
          text: 'Speed (HZ)'
        }
              // plotLines: [{
              //     value: 0,
              //     width: 1,
              //     color: '#808080'
              // }]
            },
          // tooltip: {
          //     valueSuffix: '°C'
          // },
          // legend: {
          //     layout: 'vertical',
          //     align: 'right',
          //     verticalAlign: 'middle',
          //     borderWidth: 0
          // },
          series: [{
            name: 'Parse',
            data: hzSlice
          }]
        });
  });
}

function showChart (config) {
  $(function () {
    $('#container').highcharts({
      chart: {
        type: 'bar',
        height: config.names.length * CATEGORY_HEIGHT * config.heightFactor,
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