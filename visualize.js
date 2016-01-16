// indexes into csv arrays
var NAME = 0;
var SUCCESS = 1;
var FUNCTION = 2;
var HZ = 3;
var RME = 4;
var SAMPLES = 5;

var CATEGORY_HEIGHT = 120;

var RANGE_REGEX = /(\d+):(\d+)/;

var symLinks = {
  'ast.arr': '../../../src/arr/trove/ast.arr',
  'anf-loop-compiler.arr': '../../../src/arr/compiler/anf-loop-compiler.arr'
}

var githubFilePrefix = 'https://github.com/brownplt/pyret-lang/tree/master'
+ '/tools/benchmark/auto-report-programs/';

var rawGithubFilePrefix = 'https://raw.githubusercontent.com/brownplt/'
+ 'pyret-lang/master/tools/benchmark/auto-report-programs/';


function alertError (build) {
  alert('Error loading build ' + build
    + '. It may not exist, or it hasn\'t synced over. Check the Jenkins server for build errors!');
}

function visualize (build, normalized, sortByFileSize) {
  var matchRange = build.match(RANGE_REGEX);

  var getErrorPlaceHolder = $.Deferred();

  if(matchRange) {
    var start = parseInt(matchRange[1]);
    var end   = parseInt(matchRange[2]);
    var range = [];
    var i = 0, count = start;
    while (count <= end) {
      range[i] = count;
      i++;
      count++;
    }

    $('#jenkins-nav').attr('href',
      'http://mainmast.cs.brown.edu/job/pyret-benchmark/' + end);
    $('#csv-download').attr('href', 
      'builds/auto-report-' + end + '.csv');
    
    var promises = range.map(function (build) {
      try {
        return $.ajax({
          type: 'GET',
          url: 'builds/auto-report-' + build + '.csv',
          dataType: 'text',
        });   
      } catch (e) {
        return getErrorPlaceHolder;
      }
    });

    console.log(promises);

    // http://stackoverflow.com/a/4878978
    return $.when.apply($, promises).then(function() {
      var args = Array.prototype.slice.call(arguments);
      var data = args.map(function (arg) {
        return Papa.parse(arg[0]).data;
      });
      
      makeRangeChart(data, start, end, normalized, sortByFileSize);

    });
  } else {
    var filename = 'auto-report-' + build + '.csv';
    var jenkinsHref = 'http://mainmast.cs.brown.edu/job/pyret-benchmark/' + build;
    var csvHref = 'builds/' + filename;

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

function showIndexPage () {
  $('#choose-build').toggle(true);
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
      console.error('Could not load ' + name + '; setting "length" to Infinity.');
      updateThisHash[name] = Number.POSITIVE_INFINITY;
    }
  });
}

// this function sorts names, parseData, loadData, and evalData 
// in place
function sortData (sizeOf, names, parseData, loadData, evalData) {
  var bundled = [];
  for (var i = names.length - 1; i >= 0; i--) {
    bundled[i] = {
      'name': names[i],
      'size': sizeOf[names[i]],
      'parse': parseData[i],
      'load': loadData[i],
      'eval': evalData[i]
    };
  };

  bundled = bundled.sort(function (a, b) {
    if (a.size < b.size) {
      return -1;
    }
    if (a.size > b.size) {
      return 1;
    }
    return 0;
  });
  
  for (var i = bundled.length - 1; i >= 0; i--) {
    parseData[i] = bundled[i].parse;
    loadData[i] = bundled[i].load;
    evalData[i] = bundled[i].eval;
    names[i] = bundled[i].name;
  };
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

function makeChart (csvParsed, build, normalized, sortByFileSize) {
  data = csvParsed.data;

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
      showChart();
    });
  } else {
    showChart();
  }

  function showChart () {
    $(function () {
      $('#container').highcharts({
        chart: {
          type: 'bar',
          height: names_set.length * CATEGORY_HEIGHT,
          marginRight: 100
        },
        title: {
          text: 'Pyret Benchmark'
        },
        subtitle: {
          text: 'Build ' + build + (normalized ? ': Normalized' : ': Raw Hertz')
        },
        xAxis: {
          categories: names_set,
          title: {
            text: null
          },
          labels: {
            formatter: function () {
              var disp = this.value;
              return '<a href="' + githubFilePrefix + this.value 
              + '" target="_blank">' + disp + '</a>';
            },
            useHTML: true
          }
        },
        yAxis: {
          min: 0,
          title: {
            text: normalized ? 'percent' : 'Hertz (ops/second)',
            align: 'high'
          },
          labels: {
            overflow: 'justify'
          },
          opposite: true
        },
        tooltip: {
          valueSuffix: normalized ? ' %' : ' hz'
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
         enabled: false
       },
       credits: {
        enabled: false
      },
      series: [{
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
      }]
    });
});
}
}

function getRangeSliceByName (rangeParsed, index, name) {
  return rangeParsed.map(function (buildData) {
    return buildData.filter(function (datum) {
      return datum[index] === name; }) })
}

function getFileViewOfSlice (slice, fileIndex) {
  return slice.map(function (sliceData) {return sliceData[fileIndex];})
}

function makeRangeChart (rangeParsed, start, end, normalized, sortByFileSize) {
  var FILE_INDEX = 14;
  // console.log(rangeParsed);
  var parseSlice = getRangeSliceByName(rangeParsed, FUNCTION, 'eval');
  // console.log(parseSlice);
  var testFileParseSlice = getFileViewOfSlice(parseSlice, FILE_INDEX);
  console.log(testFileParseSlice);

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