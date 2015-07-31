function alertError (build) {
  alert('Error loading build ' + build + '. It may not exist, or it hasn\'t synced over.')
}

function visualize (build, normalized, sortByFileSize) {
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

function showIndexPage () {
  $('#choose-build').toggle(true);
  $('#rss-container').toggle(true);
  $('#rss-feeds').rss('http://mainmast.cs.brown.edu/job/pyret-benchmark/rssAll/index.xml', {
    limit: 150
  });
}

// indexes into csv arrays
var NAME = 0;
var SUCCESS = 1;
var FUNCTION = 2;
var HZ = 3;
var RME = 4;
var SAMPLES = 5;

var CATEGORY_HEIGHT = 120;

var symLinks = {
  'ast.arr': '../../../src/arr/trove/ast.arr',
  'anf-loop-compiler.arr': '../../../src/arr/compiler/anf-loop-compiler.arr'
}

var githubFilePrefix = 'https://github.com/brownplt/pyret-lang/tree/master'
  + '/tools/benchmark/auto-report-programs/';

var rawGithubFilePrefix = 'https://raw.githubusercontent.com/brownplt/'
  + 'pyret-lang/master/tools/benchmark/auto-report-programs/';

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

function makeChart (parseResult, build, normalized, sortByFileSize) {
  data = parseResult.data;

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