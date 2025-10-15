import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { BarChart } from 'react-native-svg-charts';

const RidgeVisualization = ({ scalogram, frequencyLabels, ridgeFrequency, ridgeThreshold }) => {
  if (!scalogram || scalogram.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>CWT Scalogram - Ridge Visualization</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Waiting for data...</Text>
        </View>
      </View>
    );
  }

  const maxCoefficient = Math.max(...scalogram, 0.1);
  
  const chartData = scalogram.map((value, index) => {
    const freq = frequencyLabels[index];
    const isRidge = Math.abs(parseFloat(ridgeFrequency) - freq) < 0.15;
    const aboveThreshold = value > parseFloat(ridgeThreshold);
    
    let barColor = '#E3F2FD';
    if (aboveThreshold && isRidge) {
      barColor = '#4CAF50';
    } else if (isRidge) {
      barColor = '#FF9800';
    } else if (aboveThreshold) {
      barColor = '#2196F3';
    }
    
    return {
      value: value,
      svg: {
        fill: barColor,
      },
    };
  });

  const yAccessor = ({ item }) => item.value;

  const selectedFreqIndex = frequencyLabels.findIndex(
    f => Math.abs(f - parseFloat(ridgeFrequency)) < 0.15
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CWT Scalogram - Ridge Visualization</Text>
      <Text style={styles.subtitle}>
        Frequency vs Wavelet Coefficient Strength
      </Text>
      
      <View style={styles.chartContainer}>
        <BarChart
          style={styles.chart}
          data={chartData}
          yAccessor={yAccessor}
          svg={{ fill: '#2196F3' }}
          contentInset={{ top: 10, bottom: 10 }}
          spacing={0.2}
          gridMin={0}
          gridMax={maxCoefficient * 1.1}
        />
      </View>

      <View style={styles.frequencyAxis}>
        <Text style={styles.axisLabel}>0.8 Hz</Text>
        <Text style={styles.axisLabel}>2.0 Hz</Text>
        <Text style={styles.axisLabel}>3.5 Hz</Text>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.legendBox, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>Ridge (walking detected)</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendBox, { backgroundColor: '#2196F3' }]} />
          <Text style={styles.legendText}>Above threshold</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendBox, { backgroundColor: '#FF9800' }]} />
          <Text style={styles.legendText}>Ridge (below threshold)</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendBox, { backgroundColor: '#E3F2FD' }]} />
          <Text style={styles.legendText}>Below threshold</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Text style={styles.statText}>
          Ridge: <Text style={styles.statValue}>{ridgeFrequency} Hz</Text>
        </Text>
        <Text style={styles.statText}>
          Threshold: <Text style={styles.statValue}>{ridgeThreshold}</Text>
        </Text>
        <Text style={styles.statText}>
          Max Coefficient: <Text style={styles.statValue}>{maxCoefficient.toFixed(2)}</Text>
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 15,
  },
  chartContainer: {
    height: 200,
    marginBottom: 10,
  },
  chart: {
    flex: 1,
  },
  frequencyAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 15,
  },
  axisLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  legend: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  legendBox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: '#666',
  },
  stats: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statText: {
    fontSize: 12,
    color: '#666',
  },
  statValue: {
    fontWeight: 'bold',
    color: '#2196F3',
  },
  emptyState: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});

export default RidgeVisualization;
