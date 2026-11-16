"""Focused, synthetic checks; no voyage build, browser or server."""
import unittest
import numpy as np
from prepare_adaptive_map import negligible_island, renderable_polygons, simplify_ring
from shapely.geometry import Polygon


class AdaptiveMapTests(unittest.TestCase):
    def setUp(self):
        self.points=np.array([[x,0.] for x in range(11)]+[[10.,10.],[0.,10.],[0.,0.]])

    def test_straight_coast_removes_redundant_points_even_with_tight_tolerance(self):
        selected=simplify_ring(self.points,np.full(len(self.points)-1,2.5),[])
        straight=selected[selected<=10]
        self.assertEqual(straight.tolist(),[0,10])

    def test_rotating_the_coast_does_not_change_resolution(self):
        resolution=np.full(len(self.points)-1,3.)
        rotation=np.array([[0.,-1.],[1.,0.]])
        self.assertEqual(simplify_ring(self.points,resolution,[]).tolist(),
                         simplify_ring(self.points@rotation,resolution,[]).tolist())

    def test_small_island_disappears_only_when_its_whole_size_fits_the_local_budget(self):
        points=np.array([[0.,0.],[2.,0.],[2.,2.],[0.,2.],[0.,0.]])
        self.assertTrue(negligible_island(points,np.full(4,2.)))
        self.assertFalse(negligible_island(points,np.array([2.,2.,.1,2.])))

    def test_crossed_fill_is_normalized_without_restoring_source_detail(self):
        crossed=Polygon([(0,0),(2,2),(0,2),(2,0),(0,0)])
        parts=renderable_polygons(crossed)
        self.assertEqual(len(parts),2)
        self.assertTrue(all(p.is_valid for p in parts))
        self.assertAlmostEqual(sum(p.area for p in parts),2.)

    def test_close_coast_retains_a_bend_that_far_coast_can_simplify(self):
        points=np.array([[0.,0.],[1.,.2],[2.,0.],[2.,2.],[0.,2.],[0.,0.]])
        self.assertIn(1,simplify_ring(points,np.full(5,.1),[]))
        self.assertNotIn(1,simplify_ring(points,np.full(5,.5),[]))

    def test_nearest_edge_and_locked_points_limit_a_merged_stretch(self):
        resolution=np.full(len(self.points)-1,100.)
        resolution[3]=.1
        selected=simplify_ring(self.points,resolution,[7])
        self.assertIn(7,selected)
        for first,last in zip(selected,selected[1:]):
            from prepare_adaptive_map import segment_distances
            errors=segment_distances(self.points[first:last+1],self.points[first],self.points[last])
            self.assertLessEqual(float(errors.max()),float(resolution[first:last].min())+1e-9)


if __name__=='__main__':
    unittest.main()
